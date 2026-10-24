#!/usr/bin/env node
/**
 * build.mjs — produce a Tizen-ready payload in dist/.
 *
 * Steps:
 *   1. wipe dist/ (build output only — never source or user data)
 *   2. copy the static shell (index.html, config.xml, css/, assets/)
 *   3. bundle app/js/main.js → dist/js/app.js as an IIFE targeting Chromium M63
 *
 * Why IIFE + target chrome63:
 *   - Tizen serves packaged apps from a file:// origin, where <script type="module">
 *     is blocked by CORS, so native ES modules cannot be used at runtime.
 *   - target chrome63 makes esbuild down-level any newer syntax (optional
 *     chaining, nullish coalescing, class fields, ...) so the output is safe on
 *     a 2019 Samsung TV.
 *
 * Usage:
 *   node scripts/build.mjs            dev build (readable, unminified)
 *   node scripts/build.mjs --minify   release build
 *   node scripts/build.mjs --watch    rebuild on change
 */

import { build, context } from 'esbuild';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP_DIR = path.join(ROOT, 'app');
const DIST_DIR = path.join(ROOT, 'dist');

const argv = process.argv.slice(2);
const minify = argv.includes('--minify');
const watchMode = argv.includes('--watch');

const STATIC_ENTRIES = ['index.html', 'config.xml', 'css', 'assets'];

const buildOptions = {
  entryPoints: [path.join(APP_DIR, 'js', 'main.js')],
  outfile: path.join(DIST_DIR, 'js', 'app.js'),
  bundle: true,
  format: 'iife',
  target: ['chrome63'],
  platform: 'browser',
  charset: 'utf8',
  legalComments: 'none',
  minify,
  sourcemap: false,
  logLevel: 'silent'
};

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (err) {
    return false;
  }
}

async function copyStatic() {
  await mkdir(DIST_DIR, { recursive: true });
  for (const entry of STATIC_ENTRIES) {
    const from = path.join(APP_DIR, entry);
    if (!(await exists(from))) {
      continue;
    }
    await cp(from, path.join(DIST_DIR, entry), { recursive: true });
  }
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else {
      const info = await stat(full);
      out.push({ file: path.relative(DIST_DIR, full), bytes: info.size });
    }
  }
  return out;
}

async function report() {
  const files = await walk(DIST_DIR, []);
  files.sort((a, b) => a.file.localeCompare(b.file));
  let total = 0;
  for (const item of files) {
    total += item.bytes;
    console.log('  ' + item.file.padEnd(28) + (item.bytes / 1024).toFixed(1).padStart(8) + ' kB');
  }
  console.log('  ' + 'TOTAL'.padEnd(28) + (total / 1024).toFixed(1).padStart(8) + ' kB');
  console.log('  target: chrome63 / iife / ' + (minify ? 'minified' : 'unminified'));
}

const ctx = await context(buildOptions);

if (watchMode) {
  await copyStatic();
  await ctx.watch();
  watch(APP_DIR, { recursive: true }, async (event, filename) => {
    if (!filename || filename.split(path.sep)[0] === 'js') {
      return; // js changes are handled by esbuild
    }
    await copyStatic();
    console.log('[build] static copied: ' + filename);
  });
  console.log('[build] watching app/ — press Ctrl+C to stop');
} else {
  await rm(DIST_DIR, { recursive: true, force: true });
  await copyStatic();
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[build] dist/ ready');
  await report();
}
