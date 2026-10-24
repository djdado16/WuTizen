#!/usr/bin/env node
/**
 * make-placeholders.mjs — neutral dark placeholder artwork.
 *
 * The previous milestone bundled NASA space imagery, which made the UI look
 * nothing like WuPlay. Until real posters arrive from add-on metadata (M3), every
 * card uses a flat, neutral dark gradient so the layout reads correctly without
 * pretending to be artwork.
 *
 * Fully self-authored, no third-party licence, ~2 kB per image.
 * Output: app/assets/ph/ph-01.png … ph-06.png (640x360, 16:9)
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 640;
const HEIGHT = 360;
const COUNT = 6;
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'app', 'assets', 'ph');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function writePng(file, variant) {
  const stride = WIDTH * 3 + 1;
  const raw = Buffer.alloc(stride * HEIGHT);
  const lift = (variant - (COUNT - 1) / 2) * 2.2;

  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < WIDTH; x++) {
      const ty = y / HEIGHT;
      const tx = x / WIDTH;
      const cx = (x - WIDTH / 2) / (WIDTH / 2);
      const cy = (y - HEIGHT / 2) / (HEIGHT / 2);
      const vignette = 1 - 0.22 * Math.min(1, (cx * cx + cy * cy) / 2);
      const base = (13 + 9 * (1 - ty) + 3 * ((tx + ty) / 2) + lift) * vignette;
      const offset = rowStart + 1 + x * 3;
      raw[offset] = clamp(base);
      raw[offset + 1] = clamp(base + 1);
      raw[offset + 2] = clamp(base + 4);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);

  writeFileSync(file, png);
  return png.length;
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (let n = 1; n <= COUNT; n++) {
  const name = 'ph-' + String(n).padStart(2, '0') + '.png';
  const size = writePng(path.join(OUT_DIR, name), n - 1);
  total += size;
  console.log('  ' + name + '  ' + (size / 1024).toFixed(1) + ' kB');
}
console.log('[placeholders] ' + COUNT + ' files, ' + (total / 1024).toFixed(1) + ' kB total');
