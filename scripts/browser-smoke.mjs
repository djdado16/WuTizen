#!/usr/bin/env node
/**
 * browser-smoke.mjs --- end-to-end keyboard test of the built app.
 *
 * Launches headless Chrome/Edge against dist/, drives it over the Chrome
 * DevTools Protocol (no browser-automation dependency), and asserts D-pad
 * navigation, focus hand-over, the detail overlay, BACK handling, row paging
 * and language switching.
 *
 * Usage: npm run smoke   (requires a prior npm run build)
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { startMockAddon } from './mock-addon.mjs';

const APP_PORT = 8123;
const CDP_PORT = 9223;
const ADDON_PORT = 8124;
const APP_URL = 'http://127.0.0.1:' + APP_PORT + '/';

// Optional: npm run smoke -- --shots <dir>  saves PNGs of key states.
const shotsFlag = process.argv.indexOf('--shots');
const shotsDir = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  â€” ' + detail : ''));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(150);
  }
  throw new Error('devtools endpoint not ready: ' + (lastError && lastError.message));
}

/** Minimal CDP client over Node's built-in WebSocket. */
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const consoleErrors = [];
    const exceptions = [];

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          entry.reject(new Error(message.error.message));
        } else {
          entry.resolve(message.result);
        }
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        exceptions.push(details.text + ' ' + (details.exception && details.exception.description));
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(
          message.params.args.map((a) => String(a.value !== undefined ? a.value : a.description)).join(' ')
        );
      }
    });

    ws.addEventListener('open', () => {
      resolve({
        consoleErrors,
        exceptions,
        close: () => ws.close(),
        send: (method, params) =>
          new Promise((res, rej) => {
            const id = ++nextId;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params: params || {} }));
          })
      });
    });

    ws.addEventListener('error', () => reject(new Error('CDP websocket error')));
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error('evaluate failed: ' + result.exceptionDetails.text);
  }
  return result.result.value;
}

async function press(client, key, keyCode) {
  const expression =
    "(function(){var e=new KeyboardEvent('keydown',{key:" +
    JSON.stringify(key) +
    ',keyCode:' +
    keyCode +
    ',which:' +
    keyCode +
    ',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return true;})()';
  await evaluate(client, expression);
  await sleep(60);
  // Real remotes send the matching keyup; transitions rely on it to re-arm.
  await evaluate(
    client,
    "(function(){var e=new KeyboardEvent('keyup',{key:" +
      JSON.stringify(key) +
      ',keyCode:' +
      keyCode +
      ',which:' +
      keyCode +
      ',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return true;})()'
  );
  await sleep(50); // let the 110-180ms CSS transitions settle
}

/** keydown/keyup only — used to reproduce held keys and duplicate key echo. */
async function rawKey(client, type, key, keyCode, repeat) {
  const expression =
    "(function(){var e=new KeyboardEvent(" +
    JSON.stringify(type === 'down' ? 'keydown' : 'keyup') +
    ',{key:' +
    JSON.stringify(key) +
    ',keyCode:' +
    keyCode +
    ',which:' +
    keyCode +
    ',repeat:' +
    (repeat ? 'true' : 'false') +
    ',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return true;})()';
  await evaluate(client, expression);
  await sleep(60);
}

/** Poll an expression until it is truthy (network round-trips settle). */
async function waitFor(client, expression, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 8000);
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(client, expression);
      if (value) {
        return value;
      }
    } catch (err) {
      /* page may be navigating */
    }
    await sleep(100);
  }
  return null;
}

async function capture(client, name) {
  if (!shotsDir) {
    return;
  }
  // JPEG keeps the captures small enough to inspect quickly.
  const shot = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  const target = path.join(shotsDir, name + '.jpg');
  await writeFile(target, Buffer.from(shot.data, 'base64'));
  console.log('  shot  ' + name + '.jpg');
}

const browserPath = findBrowser();
if (!browserPath) {
  console.error('[smoke] No Chrome/Edge found. Set CHROME_PATH to a Chrome executable.');
  process.exit(2);
}

let serverHandle = null;
let mockAddon = null;
let chromeProcess = null;
let userDataDir = null;
let client = null;

function shutdown(code) {
  try {
    if (client) {
      client.close();
    }
  } catch (err) {
    /* ignored */
  }
  if (chromeProcess && chromeProcess.pid) {
    spawnSync('taskkill', ['/PID', String(chromeProcess.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  if (serverHandle && serverHandle.server) {
    serverHandle.server.close();
  }
  if (mockAddon && mockAddon.server) {
    mockAddon.server.close();
  }
  if (userDataDir) {
    rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(code);
}

const watchdog = setTimeout(() => {
  console.error('[smoke] timed out after 120s');
  shutdown(1);
}, 120000);

try {
  serverHandle = await startServer(APP_PORT);
  console.log('[smoke] serving dist/ at ' + APP_URL);
  mockAddon = await startMockAddon(ADDON_PORT);
  console.log('[smoke] mock add-on at ' + mockAddon.url);

  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'wuplay-smoke-'));
  chromeProcess = spawn(
    browserPath,
    [
      '--headless=new',
      '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + userDataDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1920,1080',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  const version = await waitForJson('http://127.0.0.1:' + CDP_PORT + '/json/version', 20000);
  console.log('[smoke] ' + version.Browser);

  const targetResponse = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/new?about:blank', {
    method: 'PUT'
  });
  const target = await targetResponse.json();
  client = await connectCdp(target.webSocketDebuggerUrl);

  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send('Page.navigate', { url: APP_URL });

  const readyDeadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    ready = await evaluate(client, '!!(window.WuTizenDebug && window.WuTizenDebug.snapshot)');
    if (ready) {
      break;
    }
    await sleep(150);
  }
  check('application boots in Chromium', ready);
  if (!ready) {
    console.log('[smoke] exceptions: ' + JSON.stringify(client.exceptions.slice(0, 3)));
    console.log('[smoke] console  : ' + JSON.stringify(client.consoleErrors.slice(0, 3)));
    shutdown(1);
  }
  if (shotsDir) {
    await mkdir(shotsDir, { recursive: true });
  }
  await capture(client, '01-home-hr');

  const snapshot = () => evaluate(client, 'window.WuTizenDebug.snapshot()');

  let s = await snapshot();
  check('three WuPlay-style rows rendered', s.rows === 3, s.rows + ' rows');
  check(
    'row windows limit the DOM',
    s.cards === 22 && s.totalItems === 24,
    s.cards + ' of ' + s.totalItems + ' items'
  );
  check('Croatian is the default language', s.language === 'hr', 'lang=' + s.language);
  check('cinematic hero shows the featured title', s.heroTitle === 'Tišina svemira', s.heroTitle);
  check('platform abstraction reports browser preview', s.platform === 'browser', s.platform);
  check('rail starts collapsed', s.railExpanded === false);
  check(
    'initial focus is the first poster card',
    s.focusedId === 'mv1' && s.focusedZone === 'content',
    s.focusedId + '/' + s.focusedZone
  );

  await press(client, 'ArrowRight', 39);
  s = await snapshot();
  check('RIGHT moves along the row', s.focusedId === 'mv2', s.focusedId);

  await press(client, 'ArrowLeft', 37);
  await press(client, 'ArrowDown', 40);
  s = await snapshot();
  check('DOWN enters the landscape continue row', s.focusedId === 'mv3', s.focusedId);
  check('landscape card shows its caption', s.focusedTitle === 'Zvjezdana prašina', s.focusedTitle);

  await press(client, 'Enter', 13);
  s = await snapshot();
  check(
    'OK opens details scoped to the overlay with Play focused',
    s.detailsOpen === true && s.screen === 'details' && s.focusedZone === 'overlay' && s.focusedId === 'play',
    s.focusedZone + '/' + s.focusedId
  );
  check('details shows the selected title', s.detailsTitle === 'Zvjezdana prašina', s.detailsTitle);
  check('movies have no episode section', s.episodes === 0, String(s.episodes));
  await capture(client, '02-details-movie');

  await press(client, 'Unidentified', 10009); // Samsung BACK key
  s = await snapshot();
  check(
    'BACK closes details and restores the card',
    s.detailsOpen === false && s.focusedId === 'mv3' && s.focusedZone === 'content',
    s.focusedId
  );

  await press(client, 'ArrowDown', 40);
  s = await snapshot();
  check('DOWN reaches the series row', s.focusedId === 'sr1', s.focusedId);

  await press(client, 'Enter', 13);
  s = await snapshot();
  check('series details render the episode section', s.detailsOpen === true && s.episodes === 6, String(s.episodes));
  check('series details title', s.detailsTitle === 'Kolonija', s.detailsTitle);
  await capture(client, '03-details-series');

  await press(client, 'Unidentified', 10009);
  s = await snapshot();
  check('BACK returns to the series row', s.detailsOpen === false && s.focusedId === 'sr1', s.focusedId);

  await press(client, 'ArrowRight', 39);
  await press(client, 'ArrowLeft', 37);
  await press(client, 'ArrowLeft', 37);
  s = await snapshot();
  check(
    'LEFT from the first card enters the rail at Home',
    s.focusedZone === 'rail' && s.focusedId === 'home',
    s.focusedId
  );
  check('rail expands while it holds focus', s.railExpanded === true);
  const pushTransform = await evaluate(client, 'document.querySelector(".scroller").style.transform');
  check('content shifts aside for the expanded rail', /^translate3d\(150px/.test(pushTransform), pushTransform);

  for (let i = 0; i < 4; i++) {
    await press(client, 'ArrowDown', 40);
  }
  s = await snapshot();
  check('rail reaches the language entry', s.focusedId === 'language', s.focusedId);

  await press(client, 'Enter', 13);
  s = await snapshot();
  const toastVisible = await evaluate(
    client,
    'document.querySelector(".toast").classList.contains("is-visible")'
  );
  check('language switches to English', s.language === 'en' && s.heroTitle === 'Silence of Space', s.heroTitle);
  check('language switch shows a localized toast', toastVisible === true);
  await capture(client, '04-home-en');

  await press(client, 'Enter', 13);
  s = await snapshot();
  check(
    'switching back restores Croatian',
    s.language === 'hr' && s.heroTitle === 'Tišina svemira',
    s.heroTitle
  );

  // Deterministic restart before the state-heavy sections: drop add-on state and
  // reload, so focus starts on the first card and no overlay is open.
  await evaluate(client, 'localStorage.removeItem("wuplay.addons")');
  await client.send('Page.reload');
  await waitFor(
    client,
    'window.WuTizenDebug && window.WuTizenDebug.snapshot().rows === 3 ? document.querySelectorAll(".card").length : 0',
    15000
  );

  await press(client, 'ArrowRight', 39);
  for (let i = 0; i < 6; i++) {
    await press(client, 'ArrowRight', 39);
  }
  const transforms = await evaluate(
    client,
    'Array.prototype.map.call(document.querySelectorAll(".row__track"), function (t) { return t.style.transform || "none"; })'
  );
  check('row pages horizontally', transforms.some((v) => /translate3d\(-\d/.test(v)), transforms.join(' | '));

  // ---- regressions: key echo, held BACK, repeated navigation --------------
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  s = await snapshot();
  check('OK opens details after paging', s.detailsOpen === true, s.screen);

  await rawKey(client, 'down', 'Unidentified', 10009, true); // held BACK
  s = await snapshot();
  check('held BACK auto-repeat is ignored', s.detailsOpen === true, 'open=' + s.detailsOpen);
  await rawKey(client, 'up', 'Unidentified', 10009, false);

  await rawKey(client, 'down', 'Unidentified', 10009, false);
  s = await snapshot();
  check('single BACK press dismisses details', s.detailsOpen === false && s.screen === 'home', s.screen);
  await rawKey(client, 'down', 'Unidentified', 10009, false); // duplicate, no keyup
  s = await snapshot();
  check('duplicate BACK keydown does not reach the app', s.screen === 'home', s.screen);
  await rawKey(client, 'up', 'Unidentified', 10009, false);

  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await press(client, 'Enter', 13); // two complete presses (echo-like)
  s = await snapshot();
  check(
    'repeated OK opens a single layer',
    s.detailsOpen === true && s.screen === 'details',
    s.screen + ' open=' + s.detailsOpen
  );
  await press(client, 'Unidentified', 10009);
  s = await snapshot();
  check(
    'one BACK closes the layer opened by repeated OK',
    s.detailsOpen === false && s.screen === 'home',
    s.screen
  );

  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'ArrowRight', 39); // step off the left edge so LEFT stays in the row
  for (let i = 0; i < 12; i++) {
    await press(client, i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft', i % 2 === 0 ? 39 : 37);
  }
  for (let i = 0; i < 3; i++) {
    await press(client, 'ArrowDown', 40);
  }
  for (let i = 0; i < 3; i++) {
    await press(client, 'ArrowUp', 38);
  }
  s = await snapshot();
  const beforeStress = s.focusedId;
  await press(client, 'ArrowRight', 39);
  const afterStress = await snapshot();
  check(
    'repeated navigation keeps a valid focus target',
    !!s.focusedZone &&
      s.focusedZone !== 'none' &&
      !!beforeStress &&
      afterStress.focusedId !== beforeStress,
    (s.focusedZone || 'none') + '/' + beforeStress + ' -> ' + afterStress.focusedId
  );

  const lazy = await evaluate(client, 'window.WuTizenDebug.snapshot().images');
  check('lazy loader bounds live images', lazy.attached > 0 && lazy.live <= 18, JSON.stringify(lazy));

  // ---- add-on engine (hermetic mock add-on server) -----------------------
  const addonUrl = 'http://127.0.0.1:' + ADDON_PORT;
  const added = await evaluate(
    client,
    'window.WuTizenDebug.addon.add(' + JSON.stringify(addonUrl) + ')'
  );
  check(
    'add-on manifest accepted',
    added && added.added === true && added.addon.name === 'WuTizen Test Add-on',
    added && added.addon ? added.addon.name : 'none'
  );
  check(
    'add-on persisted in localStorage',
    (await evaluate(client, 'JSON.parse(localStorage.getItem("wuplay.addons")).length')) === 1,
    String(await evaluate(client, 'localStorage.getItem("wuplay.addons")')).slice(0, 60)
  );

  await evaluate(client, 'window.WuTizenDebug.addon.reload()');
  await waitFor(client, 'document.querySelectorAll(".row").length > 3', 8000);
  s = await snapshot();
  check(
    'add-on catalogs replace the placeholder rows',
    s.rowTitles.indexOf('Test Top') > -1 && s.rowTitles.indexOf('Test Shows') > -1,
    s.rowTitles.join(' | ')
  );

  const posters = await evaluate(
    client,
    'Array.prototype.filter.call(document.querySelectorAll(".card__img"), function (i) { return i.getAttribute("data-loaded") === "1" && String(i.src).indexOf("data:image") === 0; }).length'
  );
  check('add-on posters are lazy-loaded', posters > 0, posters + ' posters');

  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length > 0', 8000);
  s = await snapshot();
  check('details fetch full meta from the add-on', s.detailsTitle === 'Mock Film 1 (Full)', s.detailsTitle);
  check('stream resource rendered as sources', s.sources === 2, String(s.sources));
  await press(client, 'Unidentified', 10009);
  s = await snapshot();
  check('BACK closes add-on details', s.detailsOpen === false, s.screen);

  for (let i = 0; i < 10; i++) {
    await press(client, 'ArrowRight', 39);
  }
  const grown = await waitFor(
    client,
    'document.querySelectorAll(".card").length >= 14 ? document.querySelectorAll(".card").length : 0',
    8000
  );
  check('catalog pagination appends the next page', !!grown, grown ? grown + ' cards' : 'no growth');

  const rejected = await evaluate(
    client,
    "(function(){return window.WuTizenDebug.addon.add('http://127.0.0.1:" +
      ADDON_PORT +
      "/bad').then(function(){return 'resolved';}, function(e){return 'rejected';});})()"
  );
  check('invalid manifest is rejected', rejected === 'rejected', String(rejected));
  const rejectedScheme = await evaluate(
    client,
    "window.WuTizenDebug.addon.add('not-a-url').then(function(){return 'resolved';}, function(e){return 'rejected';})"
  );
  check('non-http add-on address is rejected', rejectedScheme === 'rejected', String(rejectedScheme));

  await evaluate(client, 'window.WuTizenDebug.addon.remove(' + JSON.stringify(addonUrl) + ')');
  await evaluate(client, 'window.WuTizenDebug.addon.reload()');
  await sleep(300);
  s = await snapshot();
  check(
    'removing the add-on restores placeholder rows',
    s.addons === 0 && s.rowTitles.length === 3,
    s.rowTitles.join(' | ')
  );

  // ---- failure path: add-on installed, every catalog request fails ---------
  const failingUrl = 'http://127.0.0.1:' + ADDON_PORT + '/fail';
  await evaluate(client, 'window.WuTizenDebug.addon.add(' + JSON.stringify(failingUrl) + ')');
  await evaluate(client, 'window.WuTizenDebug.addon.reload()');
  await waitFor(client, 'document.querySelectorAll("[data-error-row]").length > 0', 8000);
  s = await snapshot();
  check(
    'failed catalog shows an explicit error row (no mock fallback)',
    s.errorRows > 0 && s.rowTitles.indexOf('Najbolje od najboljeg – filmovi') === -1,
    s.rowTitles.join(' | ')
  );
  check('diagnostics records the failed request', s.diagnostics > 0, String(s.diagnostics));

  await evaluate(client, 'window.WuTizenDebug.addon.openDiagnostics()');
  const diagOpen = await evaluate(client, 'window.WuTizenDebug.snapshot().diagnosticsOpen');
  const diagEnv = await evaluate(
    client,
    'document.querySelector(".diagnostics__env").textContent'
  );
  const diagErrors = await evaluate(
    client,
    'document.querySelectorAll(".diagnostics__row.is-error").length'
  );
  check(
    'diagnostics screen opens with environment + error entry',
    diagOpen === true && String(diagEnv).indexOf('avplay=') > -1 && diagErrors > 0,
    String(diagEnv).slice(0, 48)
  );
  await press(client, 'Unidentified', 10009);
  s = await snapshot();
  check('BACK closes diagnostics', s.diagnosticsOpen === false, String(s.diagnosticsOpen));

  await evaluate(client, 'window.WuTizenDebug.addon.remove(' + JSON.stringify(failingUrl) + ')');
  await evaluate(client, 'window.WuTizenDebug.addon.reload()');
  await sleep(300);
  s = await snapshot();
  check(
    'removing the failing add-on restores placeholders',
    s.rowTitles.length === 3 && s.errorRows === 0,
    s.rowTitles.join(' | ')
  );

  // ---- WuPlay profile import (sanitized fixture, token sentinel) -----------
  const fixtureAddonUrl =
    'http://127.0.0.1:' + ADDON_PORT + '/cfg-SECRET-TOKEN-abc123/manifest.json';
  const fixture = JSON.stringify({
    profiles: [{ name: 'Sanitized Profile' }],
    addons: [
      { transportUrl: fixtureAddonUrl, name: 'Mock add-on (configured path)' },
      { transportUrl: 'https://unsupported.invalid/manifest.json?token=SECRET-TOKEN-abc123' }
    ],
    watchlist: [{ id: 'tt1' }, { id: 'tt2' }],
    notes: 'SECRET-TOKEN-abc123'
  });
  const imported = await evaluate(
    client,
    'window.WuTizenDebug.profile.importText(' + JSON.stringify(fixture) + ')'
  );
  check('profile import installs reachable add-ons', imported && imported.imported === 1, JSON.stringify(imported));
  check('unsupported add-on is skipped', imported && imported.skipped >= 1, String(imported && imported.skipped));

  const storedProfile = await evaluate(client, 'localStorage.getItem("wuplay.profile")');
  check(
    'profile summary stores hosts only (no tokens)',
    String(storedProfile).indexOf('SECRET-TOKEN') === -1 && String(storedProfile).indexOf('addonHosts') > -1,
    String(storedProfile).slice(0, 60)
  );

  // Configured add-ons keep their configuration path in the ADD-ON store (needed
  // for requests), while the redacted surfaces must not contain it.
  const storedAddons = await evaluate(client, 'localStorage.getItem("wuplay.addons")');
  check(
    'configured add-on URL keeps its config path in the add-on store',
    String(storedAddons).indexOf('/cfg-SECRET-TOKEN-abc123') > -1,
    String(storedAddons).slice(0, 48)
  );
  const diagDump = await evaluate(client, 'JSON.stringify(window.WuTizenDebug.diagnostics())');
  check(
    'diagnostics never expose the config path',
    String(diagDump).indexOf('cfg-SECRET') === -1 && String(diagDump).indexOf('127.0.0.1') > -1,
    String(diagDump).slice(0, 56)
  );

  await waitFor(client, 'document.querySelectorAll(".row").length > 3', 8000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length > 0', 8000);
  const streamText = await evaluate(
    client,
    'Array.prototype.map.call(document.querySelectorAll(".source-row"), function (n) { return n.textContent; }).join(" | ")'
  );
  check('stream list shows quality labels', /1080P/i.test(streamText), String(streamText).slice(0, 70));
  await press(client, 'Unidentified', 10009);

  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  check(
    'settings screen opens with import actions',
    (await evaluate(client, 'window.WuTizenDebug.snapshot().settingsOpen')) === true
  );
  await press(client, 'Unidentified', 10009);
  s = await snapshot();
  check('BACK closes settings', s.settingsOpen === false, String(s.settingsOpen));

  /* ---- TV on-screen keyboard (Samsung IME) on the import field ------------
     Reported on device: after typing the address, OK on "Import" re-opened the
     keyboard instead of importing, because the <input> kept DOM focus (the IME
     stays attached to it) and FAILED imports left focus nowhere. These checks
     pin the whole chain: Done commits and moves to Import, OK imports once,
     the keyboard never comes back, and BACKSPACE is text editing, not BACK. */
  const isFocused = (sel) =>
    evaluate(client, 'document.querySelector(' + JSON.stringify(sel) + ').classList.contains("is-focused")');
  const domFocusIs = (sel) =>
    evaluate(client, 'document.activeElement === document.querySelector(' + JSON.stringify(sel) + ')');
  const addonCount = () => evaluate(client, 'window.WuTizenDebug.addon.list().length');
  const statusText = () =>
    evaluate(client, 'document.querySelector(".settings .addons__status").textContent');

  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  await press(client, 'ArrowRight', 39);
  check('remote navigation still works inside Settings', (await isFocused('[data-settings-action="import-file"]')) === true);
  await press(client, 'ArrowLeft', 37);
  await press(client, 'ArrowUp', 38); // Import -> URL field
  check('UP moves from Import to the URL field and focuses it (IME attaches)', (await domFocusIs('.settings__url')) === true);

  const typedUrl = '  http://127.0.0.1:' + ADDON_PORT + '/profile.json  ';
  await evaluate(
    client,
    '(function(){var f=document.querySelector(".settings__url");f.value=' + JSON.stringify(typedUrl) + ';return true;})()'
  );
  await press(client, 'Unidentified', 8); // BACKSPACE while typing
  check('BACKSPACE while typing does not close Settings', (await snapshot()).settingsOpen === true);
  check('BACKSPACE leaves the keyboard attached to the field', (await domFocusIs('.settings__url')) === true);

  const beforeDone = await addonCount();
  await press(client, 'Enter', 13); // on-screen keyboard "Done"
  const committed = await evaluate(client, 'document.querySelector(".settings__url").value');
  check('Done commits the typed address', committed === typedUrl.trim(), JSON.stringify(committed));
  check('Done closes the on-screen keyboard (field blurred)', (await domFocusIs('.settings__url')) === false);
  check('Done moves focus to the Import action', (await isFocused('[data-settings-action="import-url"]')) === true);
  check('Done does not start an import by itself', (await addonCount()) === beforeDone);

  // One OK press (plus the echo a TV remote sends) must import exactly once.
  await rawKey(client, 'down', 'Enter', 13, false);
  await rawKey(client, 'down', 'Enter', 13, false); // echo: no keyup in between
  await rawKey(client, 'up', 'Enter', 13, false);
  const afterOk = await waitFor(
    client,
    'window.WuTizenDebug.addon.list().length > ' + beforeDone + ' ? window.WuTizenDebug.addon.list().length : 0',
    12000
  );
  check('OK on Import imports exactly once', afterOk === beforeDone + 1, beforeDone + ' -> ' + afterOk);
  check(
    'the address that was typed is the one imported',
    (await evaluate(client, 'window.WuTizenDebug.addon.list().map(function (a) { return a.url; }).join(",")')).indexOf(
      'cfg-ime-token'
    ) > -1
  );
  check('keyboard does not re-open after the import', (await domFocusIs('.settings__url')) === false);
  check('focus stays on the Import action after the import', (await isFocused('[data-settings-action="import-url"]')) === true);
  check('import reports its result in Settings', String(await statusText()).length > 0, String(await statusText()).slice(0, 40));

  // Reported variant: the IME closes itself on Done, so the page only sees a
  // later OK while the field is still the logical cursor.
  await press(client, 'ArrowUp', 38);
  await evaluate(client, 'document.activeElement.blur(); true'); // IME closed by Done
  const beforeStray = await addonCount();
  await press(client, 'Enter', 13);
  check(
    'OK on an already-closed keyboard commits and moves to Import',
    (await isFocused('[data-settings-action="import-url"]')) === true && (await domFocusIs('.settings__url')) === false
  );
  check('that OK does not start an import by itself', (await addonCount()) === beforeStray);

  await press(client, 'Unidentified', 10009);
  check('BACK closes Settings after the keyboard flow', (await snapshot()).settingsOpen === false);

  await sleep(200);
  check('no uncaught exceptions', client.exceptions.length === 0, client.exceptions.join('; ').slice(0, 240));
  check('no console errors', client.consoleErrors.length === 0, client.consoleErrors.join('; ').slice(0, 240));

  // ---- persistence across a reload (last: a reload resets console logs) ---
  await client.send('Page.reload');
  let restoredRows = 0;
  for (let i = 0; i < 80 && !restoredRows; i++) {
    await sleep(150);
    try {
      restoredRows = await evaluate(
        client,
        'window.WuTizenDebug && window.WuTizenDebug.snapshot().addons >= 1 ? document.querySelectorAll(".row").length : 0'
      );
    } catch (err) {
      restoredRows = 0;
    }
  }
  check('add-on survives a page reload', restoredRows > 0, restoredRows ? restoredRows + ' rows' : 'not restored');

  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  const restoredSources = await waitFor(
    client,
    'document.querySelectorAll(".source-row").length > 0 ? document.querySelectorAll(".source-row").length : 0',
    8000
  );
  check(
    'manifest, catalog and stream resources work after restart',
    !!restoredSources,
    restoredSources ? restoredSources + ' sources' : 'none'
  );

  const failedChecks = results.filter((r) => !r.ok);
  console.log('');
  console.log(
    failedChecks.length === 0
      ? '[smoke] ALL ' + results.length + ' BROWSER CHECKS PASSED'
      : '[smoke] ' + failedChecks.length + ' OF ' + results.length + ' CHECKS FAILED'
  );
  clearTimeout(watchdog);
  shutdown(failedChecks.length === 0 ? 0 : 1);
} catch (err) {
  console.error('[smoke] error: ' + (err && err.stack ? err.stack : err));
  clearTimeout(watchdog);
  shutdown(1);
}
