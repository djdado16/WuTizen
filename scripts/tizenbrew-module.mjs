#!/usr/bin/env node
/**
 * tizenbrew-module.mjs — validate the TizenBrew module manifest and print the
 * exact identifiers needed to install the module on the TV.
 *
 * Contract verified against the official TizenBrew sources (2026-10):
 *   docs/MODULES.md
 *     -> application modules declare packageType:"app", appName, appPath, keys
 *   service-nextgen/service/utils/moduleLoader.js
 *     -> fetch(`https://cdn.jsdelivr.net/${module}/package.json`)
 *   service-nextgen/service/index.js
 *     -> app modules are served from
 *        http://127.0.0.1:8081/module/<encodeURIComponent(module)>/<appPath>
 *
 * A module is addressed as "<type>/<name>" where type is `gh` or `npm`, so a
 * GitHub repository is added in TizenBrew as `gh/<user>/<repo>`.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const problems = [];

function fail(message) {
  problems.push(message);
}

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));

/* --- 1. manifest fields required by docs/MODULES.md ----------------------- */
if (pkg.packageType !== 'app') {
  fail('packageType must be "app" (found: ' + pkg.packageType + ')');
}
if (!pkg.appName) {
  fail('appName is missing');
}
if (!pkg.appPath) {
  fail('appPath is missing');
}
if (!Array.isArray(pkg.keys)) {
  fail('keys must be an array (may be empty)');
}
if (!pkg.name || !pkg.version) {
  fail('name and version are required for jsDelivr resolution');
}

/* --- 2. appPath must exist inside the repository ------------------------- */
if (pkg.appPath) {
  try {
    const info = await stat(path.join(ROOT, pkg.appPath));
    if (!info.isFile()) {
      fail(pkg.appPath + ' is not a file');
    }
  } catch (err) {
    fail(pkg.appPath + ' does not exist — run "npm run build" first');
  }
}

/* --- 3. payload inventory + secret scan ---------------------------------- */
const TEXT_EXTENSIONS = ['.html', '.js', '.css', '.json', '.xml', '.txt', '.map'];
const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /apikey/i,
  /bearer\s+[a-z0-9._-]{12,}/i,
  /token\s*[:=]\s*['"][^'"]{12,}/i,
  /password\s*[:=]\s*['"][^'"]+/i,
  /addon[a-z]*\s*[:=]\s*['"]https?:\/\//i
];

/**
 * Narrow, documented exception: `api_key` is a *query parameter name* in the
 * documented Emby API (`/Videos/{id}/stream?…&api_key=…`), not a credential.
 * Only the bare parameter token is neutralised before matching — a parameter
 * that carries a secret-looking VALUE is still reported, and every other
 * pattern is applied to the untouched text.
 */
const EMBY_PARAM_NAME = /api_key=(?![A-Za-z0-9_-]{8,})/gi;
function scrubParameterNames(text) {
  return String(text).replace(EMBY_PARAM_NAME, 'api-param=');
}

/** Self-test: the exception must not hide a real key. */
function checkSecretDetection(sample) {
  const scrubbed = scrubParameterNames(sample);
  return SECRET_PATTERNS.some((pattern) => pattern.test(scrubbed));
}
const secretSelfTestOk =
  checkSecretDetection('&api_key=abcdef123456') === true &&
  checkSecretDetection('&api_key=') === false &&
  checkSecretDetection('const k = "apikey";') === true;

let files = 0;
let bytes = 0;
const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else {
      files += 1;
      const info = await stat(full);
      bytes += info.size;
      if (TEXT_EXTENSIONS.indexOf(path.extname(entry.name).toLowerCase()) === -1) {
        continue;
      }
      const text = scrubParameterNames(await readFile(full, 'utf8'));
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          findings.push(path.relative(ROOT, full) + ' matches ' + pattern);
        }
      }
    }
  }
}

try {
  await walk(DIST);
} catch (err) {
  fail('dist/ not readable — run "npm run build" first');
}

if (!secretSelfTestOk) {
  findings.push('secret-scan self-test failed (the api_key exception must not hide real keys)');
}

if (findings.length > 0) {
  findings.forEach(fail);
}

/* --- 4. derive the GitHub repository slug -------------------------------- */
function repoSlug(manifest) {
  const repo = manifest.repository;
  const url = typeof repo === 'string' ? repo : repo && repo.url;
  if (!url) {
    return null;
  }
  const cleaned = url.replace(/^git\+/, '').replace(/\.git$/, '');
  const match = /github\.com[/:]([^/]+)\/([^/]+)/.exec(cleaned);
  return match ? match[1] + '/' + match[2] : null;
}

const slug = repoSlug(pkg);

/* --- 5. report ----------------------------------------------------------- */
console.log('[module] ' + pkg.appName + ' ' + pkg.version + '  (packageType=' + pkg.packageType + ')');
console.log('[module] appPath in repo  : ' + pkg.appPath);
console.log('[module] payload         : ' + files + ' files, ' + (bytes / 1024).toFixed(1) + ' kB');
console.log('[module] secret scan     : ' + (findings.length === 0 ? 'clean' : findings.length + ' finding(s)'));

if (slug) {
  const moduleName = 'gh/' + slug;
  console.log('[module] module id       : ' + moduleName);
  console.log('[module] manifest (jsDelivr): https://cdn.jsdelivr.net/' + moduleName + '/package.json');
  console.log('[module] entry    (jsDelivr): https://cdn.jsdelivr.net/' + moduleName + '/' + pkg.appPath);
  console.log('');
  console.log('[module] TizenBrew → Modules → Add GitHub Module → enter:  ' + slug);
  console.log('[module] pinned release (needs a git tag):  ' + slug + '@v' + pkg.version);
} else {
  console.log('[module] repository URL missing in package.json — cannot derive the GitHub slug');
}

if (problems.length > 0) {
  console.log('');
  problems.forEach((problem) => console.log('  FAIL  ' + problem));
  console.log('[module] ' + problems.length + ' PROBLEM(S)');
  process.exit(1);
}

console.log('');
console.log('[module] OK — manifest and payload are TizenBrew-ready');
