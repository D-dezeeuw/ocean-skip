#!/usr/bin/env node
// Nano Banana (OpenRouter) art generation pipeline for OceanSkips.
//
// Dev-time only — the shipped game stays a dependency-free single
// index.html. This script calls OpenRouter's google/gemini-2.5-flash-image
// model for each manifest entry, post-processes the result (chroma-key +
// trim for sprites, resize + webp for everything), caches it under
// tools/art-cache/, and writes tools/generated-assets.json — a flat
// {id: dataURI} map that a separate integration step inlines into
// index.html (see implementation-20.md Phase A/B).
//
// Usage:
//   OPENROUTER_API_KEY=... node gen-art.mjs [--only=id1,id2] [--force] [--reprocess]
//
// Without --only, every manifest entry missing from art-cache/*.webp is
// generated; already-cached ids are skipped (re-used) unless --force (which
// calls the model again) or --reprocess (which re-runs post-processing —
// chroma-key/trim/resize — against the cached *-src.png with no new API
// call; use this to tune the pipeline without burning generations).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSETS, ART_CACHE_DIR } from './art-manifest.mjs';

const MODEL = 'google/gemini-2.5-flash-image';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const KEY = process.env.OPENROUTER_API_KEY;

const args = process.argv.slice(2);
const force = args.includes('--force');
const reprocess = args.includes('--reprocess');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

function log(...a) { console.log('[gen-art]', ...a); }

async function callNanoBanana(prompt) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  const url = msg?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith('data:')) {
    throw new Error(`No image in response: ${JSON.stringify(msg).slice(0, 300)}`);
  }
  return Buffer.from(url.split(',')[1], 'base64');
}

// Nano Banana rarely renders an exact #00ff00 — it tends to drift toward a
// pastel/muted green depending on the prompt. Rather than key against a
// fixed color, sample the actual background from the corners (the prompt
// keeps the subject centered with margin) and key by distance to that.
function sampleBackground(raw, info) {
  const { width, height, channels } = info;
  const patch = 6;
  const corners = [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]];
  let r = 0, g = 0, b = 0, n = 0;
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + patch; y++) {
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * width + x) * channels;
        r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; n++;
      }
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

function chromaKeyToBackground(raw, info) {
  const { width, height, channels } = info;
  const bg = sampleBackground(raw, info);
  const px = new Uint8ClampedArray(raw);
  const T1 = 30, T2 = 85; // fully keyed below T1, opaque above T2, faded between
  for (let i = 0; i < px.length; i += channels) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const d = Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2);
    if (d < T1) {
      px[i + 3] = 0;
    } else if (d < T2) {
      const a = clamp01((d - T1) / (T2 - T1));
      px[i + 3] = Math.round(px[i + 3] * a);
      // despill: blend the pixel away from the background color proportionally
      px[i] = Math.round(lerp(bg.r, r, a));
      px[i + 1] = Math.round(lerp(bg.g, g, a));
      px[i + 2] = Math.round(lerp(bg.b, b, a));
    }
  }
  return { data: Buffer.from(px.buffer, px.byteOffset, px.byteLength), width, height, channels };
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Bounding box of pixels with alpha above a small noise floor.
function alphaBBox(raw, info) {
  const { width, height, channels } = raw;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = raw.data[(y * width + x) * channels + 3];
      if (a > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height }; // nothing keyed — bail to full frame
  const pad = 2;
  const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
  return {
    left, top,
    width: Math.min(width - left, maxX - minX + 1 + pad * 2),
    height: Math.min(height - top, maxY - minY + 1 + pad * 2),
  };
}

async function processTexture(pngBuf, w, h) {
  return sharp(pngBuf).resize(w, h, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
}

async function processSprite(pngBuf, w, h) {
  const img = sharp(pngBuf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const keyed = chromaKeyToBackground(data, info);
  const bbox = alphaBBox(keyed, info);
  const keyedPng = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
    .extract(bbox)
    .png()
    .toBuffer();
  // fit inside a transparent canvas of exactly the target size, centered
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(keyedPng).resize(w, h, { fit: 'inside' }).toBuffer(), gravity: 'centre' }])
    .webp({ quality: 90 })
    .toBuffer();
}

async function main() {
  if (!KEY) throw new Error('OPENROUTER_API_KEY is not set');
  await mkdir(ART_CACHE_DIR, { recursive: true });

  const targets = ASSETS.filter((a) => !only || only.has(a.id));
  if (!targets.length) { log('nothing matched --only filter'); return; }

  const manifest = {};
  for (const asset of targets) {
    const webpPath = path.join(ART_CACHE_DIR, `${asset.id}.webp`);
    const srcPath = path.join(ART_CACHE_DIR, `${asset.id}-src.png`);
    if (!force && !reprocess && existsSync(webpPath)) {
      log(asset.id, '— using cached', webpPath);
    } else {
      let raw;
      if (!force && reprocess && existsSync(srcPath)) {
        log(asset.id, '— reprocessing cached source (no API call)');
        raw = await readFile(srcPath);
      } else {
        log(asset.id, '— generating via', MODEL);
        raw = await callNanoBanana(asset.prompt);
        await writeFile(srcPath, raw);
      }
      const processed = asset.mode === 'sprite'
        ? await processSprite(raw, asset.w, asset.h)
        : await processTexture(raw, asset.w, asset.h);
      await writeFile(webpPath, processed);
      log(asset.id, '— wrote', webpPath, `(${processed.length} bytes)`);
    }
    const bytes = await readFile(webpPath);
    manifest[asset.id] = {
      dataUri: `data:image/webp;base64,${bytes.toString('base64')}`,
      bytes: bytes.length, w: asset.w, h: asset.h, mode: asset.mode,
    };
  }

  const manifestPath = path.join(path.dirname(ART_CACHE_DIR), 'generated-assets.json');
  let combined = {};
  if (existsSync(manifestPath)) combined = JSON.parse(await readFile(manifestPath, 'utf8'));
  Object.assign(combined, manifest);
  await writeFile(manifestPath, JSON.stringify(combined, null, 2));
  const totalBytes = Object.values(combined).reduce((s, v) => s + v.bytes, 0);
  log(`wrote ${manifestPath} — ${Object.keys(combined).length} assets, ${totalBytes} bytes total`);
}

// only run when invoked directly (`node gen-art.mjs`), never on import —
// importing this module (e.g. to reuse processSprite/processTexture from
// another script) must not silently trigger API calls.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error('[gen-art] FAILED:', err.message); process.exit(1); });
}
