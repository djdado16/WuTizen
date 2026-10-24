#!/usr/bin/env node
/**
 * make-icon.mjs — generates app/assets/icon.png (512x512).
 *
 * The icon is authored procedurally so the repository contains no third-party
 * artwork. It is a placeholder: the final branding must be produced by/for the
 * project owner (the WuPlay logo is their trademark, not ours to copy).
 *
 * No dependencies: PNG is written by hand (zlib is part of Node).
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(ROOT, 'app', 'assets', 'icon.png');

/* --- helpers ------------------------------------------------------------- */

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
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function roundedRectAlpha(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) <= radius ? 255 : 0;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.min(1, Math.max(0, (wx * vx + wy * vy) / len));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/* --- artwork ------------------------------------------------------------- */

// "W" polyline inside the accent disc.
const W_POINTS = [
  [178, 198],
  [222, 322],
  [256, 244],
  [290, 322],
  [334, 198]
];

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    const t = y / SIZE;
    let r = Math.round(22 - 10 * t);
    let g = Math.round(22 - 10 * t);
    let b = Math.round(30 - 12 * t);
    let a = roundedRectAlpha(x, y, SIZE, 96);

    const dx = x - SIZE / 2;
    const dy = y - SIZE / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= 168) {
      // accent disc with a soft vertical gradient
      const k = y / SIZE;
      r = Math.round(160 - 50 * k);
      g = Math.round(120 - 60 * k);
      b = Math.round(255 - 40 * k);
    }

    for (let i = 0; i < W_POINTS.length - 1; i++) {
      const [ax, ay] = W_POINTS[i];
      const [bx, by] = W_POINTS[i + 1];
      if (distanceToSegment(x, y, ax, ay, bx, by) <= 15) {
        r = 250;
        g = 250;
        b = 255;
      }
    }

    const offset = rowStart + 1 + x * 4;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
    raw[offset + 3] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log('[icon] wrote ' + OUT + ' (' + (png.length / 1024).toFixed(1) + ' kB, ' + SIZE + 'x' + SIZE + ')');
