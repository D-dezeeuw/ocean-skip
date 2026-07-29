#!/usr/bin/env node
// Injects a subset of tools/generated-assets.json into index.html's
// GENERATED_ASSETS block, between the marker comments. Only assets actually
// wired into the renderer should be listed here — anything else stays
// cached in tools/art-cache/ for a future pass instead of shipping unused
// bytes in the single-file game.
//
// Usage: node inline-assets.mjs id1 id2 id3 ...
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ids = process.argv.slice(2);
if (!ids.length) throw new Error('usage: node inline-assets.mjs id1 id2 ...');

const root = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(await readFile(path.join(root, 'generated-assets.json'), 'utf8'));
const indexPath = path.join(path.dirname(root), 'index.html');
let html = await readFile(indexPath, 'utf8');

const entries = ids.map((id) => {
  if (!manifest[id]) throw new Error(`no cached asset for id "${id}" — run gen-art.mjs first`);
  return `  ${JSON.stringify(id)}: ${JSON.stringify(manifest[id].dataUri)},`;
});
const block = `const GENERATED_ASSETS = {\n${entries.join('\n')}\n};`;

const re = /const GENERATED_ASSETS = \{[\s\S]*?\};/;
if (!re.test(html)) throw new Error('GENERATED_ASSETS block not found in index.html');
html = html.replace(re, block);

await writeFile(indexPath, html);
const totalBytes = ids.reduce((s, id) => s + manifest[id].bytes, 0);
console.log(`[inline-assets] inlined ${ids.length} assets (${totalBytes} raw bytes, ~${Math.ceil(totalBytes * 4 / 3)} base64 chars) into index.html`);
