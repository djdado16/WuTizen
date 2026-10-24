#!/usr/bin/env node
/**
 * verify.mjs — static compatibility + consistency gate for dist/.
 *
 * Checks (no browser required):
 *   1. dist/ contains every file a .wgt needs
 *   2. the bundle is a classic-script IIFE (no import/export statements)
 *   3. the bundle contains no syntax newer than Chromium M63
 *   4. CSS contains no features unsupported by Chromium M63
 *   5. hr/en dictionaries have identical key sets, and every key used with
 *      t('...') exists in both
 *   6. config.xml declares the TV profile and required_version="5.0"
 *
 * Exit code 1 on any failure.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const APP = path.join(ROOT, 'app');

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  — ' + detail : ''));
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch (err) {
    return false;
  }
}

async function readText(p) {
  return readFile(p, 'utf8');
}

/* --- 1. required dist files ---------------------------------------------- */

const REQUIRED = [
  'index.html',
  'config.xml',
  'assets/icon.png',
  'css/reset.css',
  'css/tokens.css',
  'css/layout.css',
  'css/components.css',
  'js/app.js'
];

const missing = [];
for (const file of REQUIRED) {
  if (!(await exists(path.join(DIST, file)))) {
    missing.push(file);
  }
}
check(
  'dist/ payload complete',
  missing.length === 0,
  missing.length ? 'missing: ' + missing.join(', ') : REQUIRED.length + ' files'
);

/* --- 2 + 3. bundle syntax ------------------------------------------------- */

let bundle = '';
try {
  bundle = await readText(path.join(DIST, 'js', 'app.js'));
} catch (err) {
  bundle = '';
}

const hasModuleSyntax = /^\s*(import|export)\s/m.test(bundle);
check(
  'bundle is a classic IIFE script',
  bundle.length > 0 && !hasModuleSyntax,
  hasModuleSyntax ? 'found import/export' : (bundle.length / 1024).toFixed(1) + ' kB'
);

const MODERN_SYNTAX = [
  ['optional chaining ?.', /\?\.\s*[a-zA-Z_$[(]/],
  ['nullish coalescing ??', /\?\?/],
  ['logical assignment (&&=, ||=, ??=)', /(\|\||&&|\?\?)=/],
  ['class private field', /#[a-zA-Z_$][\w$]*\s*=/],
  ['static initialization block', /static\s*\{/],
  ['optional catch binding', /catch\s*\{/]
];

const syntaxHits = MODERN_SYNTAX.filter((entry) => entry[1].test(bundle)).map((entry) => entry[0]);
check('no syntax newer than Chromium M63', syntaxHits.length === 0, syntaxHits.join(', ') || 'clean');

/* --- 4. CSS features ------------------------------------------------------ */

const CSS_BANNED = [
  ['flex/grid gap shorthand', /(^|[;{\s])gap\s*:/m],
  ['inset shorthand', /(^|[;{\s])inset\s*:/m],
  ['aspect-ratio', /aspect-ratio\s*:/m],
  ['backdrop-filter', /backdrop-filter\s*:/m],
  [':focus-visible', /:focus-visible/m],
  [':is() / :where() / :has()', /:(is|where|has)\(/m],
  ['clamp()/min()/max()', /(^|[^a-zA-Z-])(clamp|min|max)\(/m],
  ['color-mix()', /color-mix\(/m],
  ['@container', /@container/m],
  ['CSS nesting (&)', /^\s*&/m],
  ['individual transform props', /(^|[;{\s])(translate|rotate|scale)\s*:/m],
  ['logical properties (margin-inline etc.)', /(margin|padding)-(inline|block)/m],
  ['viewport units dvh/svh/lvh', /\d(dvh|svh|lvh)/m],
  ['@supports selector()', /@supports\s+selector/m]
];

const cssFiles = (await readdir(path.join(DIST, 'css'))).filter((f) => f.endsWith('.css'));
const cssHits = [];
for (const file of cssFiles) {
  // Strip comments so that documentation mentioning a banned feature does not
  // trip the scan.
  const css = (await readText(path.join(DIST, 'css', file))).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const entry of CSS_BANNED) {
    if (entry[1].test(css)) {
      cssHits.push(file + ': ' + entry[0]);
    }
  }
}
check('CSS safe for Chromium M63', cssHits.length === 0, cssHits.join('; ') || cssFiles.length + ' files clean');

/* --- 5. i18n parity ------------------------------------------------------- */

const hr = (await import(pathToFileURL(path.join(APP, 'js', 'i18n', 'hr.js')).href)).default;
const en = (await import(pathToFileURL(path.join(APP, 'js', 'i18n', 'en.js')).href)).default;

const hrKeys = Object.keys(hr).sort();
const enKeys = Object.keys(en).sort();
const onlyHr = hrKeys.filter((k) => enKeys.indexOf(k) === -1);
const onlyEn = enKeys.filter((k) => hrKeys.indexOf(k) === -1);
check(
  'hr/en dictionaries match',
  onlyHr.length === 0 && onlyEn.length === 0,
  onlyHr.concat(onlyEn).join(', ') || hrKeys.length + ' keys each'
);

const jsFiles = [];
async function collectJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJs(full);
    } else if (entry.name.endsWith('.js')) {
      jsFiles.push(full);
    }
  }
}
await collectJs(path.join(APP, 'js'));

const usedKeys = new Set();
for (const file of jsFiles) {
  const source = await readText(file);
  const re = /\bt\('([^']+)'\)/g;
  let match = re.exec(source);
  while (match) {
    usedKeys.add(match[1]);
    match = re.exec(source);
  }
  // rail.js builds 'lang.' + lang dynamically
  if (source.indexOf("'lang.' +") > -1) {
    usedKeys.add('lang.hr');
    usedKeys.add('lang.en');
  }
}

const unknown = [];
usedKeys.forEach((key) => {
  if (!(key in hr) || !(key in en)) {
    unknown.push(key);
  }
});
check('all t() keys defined', unknown.length === 0, unknown.join(', ') || usedKeys.size + ' keys used');

/* --- 6. config.xml -------------------------------------------------------- */

const config = await readText(path.join(DIST, 'config.xml'));
const configChecks = [
  ['tv-samsung profile', /<tizen:profile\s+name="tv-samsung"\s*\/>/.test(config)],
  ['required_version 5.0', /required_version="5\.0"/.test(config)],
  ['content src', /<content\s+src="index\.html"\s*\/>/.test(config)],
  ['internet privilege', /privilege\/internet/.test(config)],
  ['inputdevice privilege', /privilege\/tv\.inputdevice/.test(config)],
  ['hwkey-event enabled', /hwkey-event="enable"/.test(config)]
];
const configFails = configChecks.filter((entry) => !entry[1]).map((entry) => entry[0]);
check('config.xml TV declarations', configFails.length === 0, configFails.join(', ') || 'complete');

// Real XML well-formedness check when Python is available (best effort).
const xml = spawnSync(
  'python',
  [
    '-c',
    'import sys,xml.etree.ElementTree as ET;ET.parse(sys.argv[1]);print("OK")',
    path.join(DIST, 'config.xml')
  ],
  { encoding: 'utf8' }
);
if (xml.error || xml.status !== 0) {
  check(
    'config.xml is well-formed XML',
    false,
    (xml.stderr || String(xml.error) || 'unknown error').toString().trim().slice(0, 160)
  );
} else {
  check('config.xml is well-formed XML', true, 'parsed by Python ElementTree');
}

/* --- summary -------------------------------------------------------------- */

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(
  failed.length === 0
    ? '[verify] ALL CHECKS PASSED (' + results.length + ')'
    : '[verify] ' + failed.length + ' CHECK(S) FAILED'
);
process.exit(failed.length === 0 ? 0 : 1);
