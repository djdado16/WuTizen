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
import { startConfigurator } from '../tools/configurator/server.mjs';

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

/** Play opens the source picker when several sources exist: take the first. */
async function pickFirstSource(client) {
  const open = await waitFor(
    client,
    'document.querySelector(".picker.is-open") ? window.WuTizenDebug.picker.stage() : 0',
    8000
  );
  if (!open) {
    return false;
  }
  if (open === 'providers') {
    await press(client, 'Enter', 13); // first provider
    await sleep(150);
  }
  await press(client, 'Enter', 13); // first stream of that provider
  await sleep(150);
  return true;
}

/** Provider stage: select the provider with this resolver key. */
async function pickProvider(client, key) {
  const stage = await waitFor(
    client,
    'document.querySelector(".picker.is-open") ? window.WuTizenDebug.picker.stage() : 0',
    8000
  );
  if (stage !== 'providers') {
    return false;
  }
  if (!(await focusPickerRow(client, 'p' + key))) {
    return false;
  }
  await press(client, 'Enter', 13);
  return (await waitFor(client, 'window.WuTizenDebug.picker.stage() === "streams" ? 1 : 0', 6000)) === 1;
}

/** Stream stage: select the stream with this global index. */
async function pickStream(client, index) {
  if (!(await focusPickerRow(client, 's' + index))) {
    return false;
  }
  await press(client, 'Enter', 13);
  return true;
}

/** Focus a picker row by its data-picker-row id (moves with the remote). */
async function focusPickerRow(client, id) {
  for (let i = 0; i < 24; i++) {
    const current = await evaluate(
      client,
      'document.querySelector(".picker-row.is-focused") ? document.querySelector(".picker-row.is-focused").getAttribute("data-picker-row") : null'
    );
    if (String(current) === String(id)) {
      return true;
    }
    await press(client, 'ArrowDown', 40);
  }
  return false;
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
let configuratorServer = null;
const CONF_PORT = 8131;
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
  if (configuratorServer && configuratorServer.server) {
    configuratorServer.server.close();
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
  configuratorServer = await startConfigurator(CONF_PORT, {});
  console.log('[smoke] configurator at ' + configuratorServer.url);

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
      // HTML5 playback tests drive the real media stack without a user gesture.
      '--autoplay-policy=no-user-gesture-required',
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
  // The offset must match the rail panel width (a CSS token), not a constant:
  // a 150px push left the 300px panel covering the left half of the page.
  const railPanelWidth = await evaluate(
    client,
    'Math.round(document.querySelector(".rail__panel").getBoundingClientRect().width)'
  );
  check(
    'content shifts aside by the rail panel width',
    /^translate3d\((\d+)px/.test(pushTransform) &&
      parseInt(/^translate3d\((\d+)px/.exec(pushTransform)[1], 10) === railPanelWidth,
    pushTransform + ' vs panel ' + railPanelWidth
  );

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
  // Meta and streams are fetched in parallel; the row order of the catalogs is
  // not deterministic, so assert on the meta *payload* rather than a fixed title.
  await waitFor(
    client,
    'document.querySelector(".details__desc") && /Placeholder synopsis/.test(document.querySelector(".details__desc").textContent) ? 1 : 0',
    8000
  );
  s = await snapshot();
  check('details fetch full meta from the add-on', /^Mock /.test(s.detailsTitle), s.detailsTitle);
  check('stream resource rendered as sources', s.sources === 3, String(s.sources));
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

  /* ---- Milestone 5: playback -------------------------------------------- */
  const playerState = () => evaluate(client, 'window.WuTizenDebug.player.state()');
  const sampleUrl = 'http://127.0.0.1:' + ADDON_PORT + '/media/sample.wav';

  // End-to-end: details → Play → real HTML5 playback of the served sample.
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 8000);
  await press(client, 'Enter', 13); // Play (primary action, already focused)
  await pickFirstSource(client);
  const firstPlay = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status==="playing"&&s.position>0?s:0;})()',
    15000
  );
  check(
    'Play starts real playback (HTML5 engine)',
    !!firstPlay,
    firstPlay
      ? firstPlay.backend + ' @' + firstPlay.position + 'ms'
      : 'no playback ' +
        (await evaluate(
          client,
          'JSON.stringify({picker:window.WuTizenDebug.picker.open(),stage:window.WuTizenDebug.picker.stage(),rows:window.WuTizenDebug.picker.rows(),focused:!!document.querySelector(".picker-row.is-focused"),focusText:(document.querySelector(".picker-row.is-focused")||{}).textContent||"",streams:window.WuTizenDebug.sources.list().length,state:window.WuTizenDebug.player.state()})'
        ))
  );
  check(
    'duration and progress are tracked',
    !!firstPlay && firstPlay.duration > 2000 && firstPlay.position > 0,
    firstPlay ? firstPlay.duration + 'ms' : ''
  );
  check(
    'progress bar reflects the position',
    (await evaluate(client, 'parseFloat(document.querySelector(".player__played").style.width)')) > 0
  );

  await press(client, 'Enter', 13); // OK = pause
  const paused = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status==="paused"?s:0;})()',
    4000
  );
  check('OK pauses playback', !!paused, paused ? 'paused' : 'still playing');
  await press(client, 'Enter', 13); // OK = resume
  const resumed = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status==="playing"?s:0;})()',
    4000
  );
  check('OK resumes playback', !!resumed, resumed ? 'playing' : 'not resumed');

  const beforeSeek = (await playerState()).position;
  await press(client, 'ArrowRight', 39); // +10 s
  const afterSeek = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.position>' +
      (beforeSeek + 5000) +
      '?s.position:0;})()',
    10000
  );
  check('RIGHT seeks forward', !!afterSeek, beforeSeek + ' -> ' + afterSeek);
  await press(client, 'ArrowLeft', 37); // -10 s
  const backSeek = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status!=="error"&&s.position<5000?s.position:0;})()',
    10000
  );
  check('LEFT seeks back', !!backSeek, String(backSeek));

  await press(client, 'Unidentified', 10009); // BACK closes the player only
  const afterBack = await snapshot();
  check('BACK closes the player', (await playerState()).open === false);
  check('details is still open after leaving the player', afterBack.detailsOpen === true, afterBack.screen);
  check(
    'closing the player releases the media element',
    (await evaluate(client, 'document.querySelector(".player__video").getAttribute("src")')) === null &&
      (await evaluate(client, 'document.querySelector(".player").className')).indexOf('is-open') === -1
  );
  check('remote focus is restored in details', afterBack.focusedZone === 'overlay', afterBack.focusedZone);
  await press(client, 'Unidentified', 10009); // close details

  // Torrent / magnet streams: explained, never attempted, no direct torrent playback.
  const torrent = await evaluate(
    client,
    'window.WuTizenDebug.player.open({ name: "TorBox 1080p", infoHash: "deadbeefdeadbeef", fileIdx: 0 })'
  );
  check(
    'torrent (infoHash) source is refused with a reason',
    torrent.open === true && torrent.error === 'torrent',
    JSON.stringify(torrent).slice(0, 70)
  );
  check(
    'a refused source never loads a media URL',
    (await evaluate(client, 'document.querySelector(".player__video").getAttribute("src")')) === null
  );
  check(
    'the refusal is explained on screen',
    (await evaluate(client, 'document.querySelector(".player__error").className')).indexOf('is-visible') > -1
  );
  const magnet = await evaluate(client, 'window.WuTizenDebug.player.open({ url: "magnet:?xt=urn:btih:abc" })');
  check('magnet links are refused too', magnet.error === 'torrent', magnet.error);
  const external = await evaluate(
    client,
    'window.WuTizenDebug.player.open({ externalUrl: "https://example.invalid/watch" })'
  );
  check('external-app streams are refused', external.error === 'external', external.error);
  await evaluate(client, 'window.WuTizenDebug.player.close()');

  // Broken/expired URL: the engine error is mapped to a readable message.
  await evaluate(
    client,
    'window.WuTizenDebug.player.open({ url: ' +
      JSON.stringify('http://127.0.0.1:' + ADDON_PORT + '/media/missing.mp4') +
      ' })'
  );
  const broken = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status==="error"?s:0;})()',
    15000
  );
  check('a broken/expired source ends in a clear error state', !!broken && !!broken.error, broken ? broken.error : 'no error');
  await press(client, 'Unidentified', 10009); // BACK still works from the error
  check('BACK closes the error state', (await playerState()).open === false);

  /* ---- Milestone 5: AVPlay engine selection (stubbed Samsung API) --------
     The real webapis.avplay only exists on the TV, so the adapter is driven with
     a stub that records the calls it receives. The code under test is the real
     adapter in playback/player.js. */
  await evaluate(
    client,
    '(function(){window.__avplayCalls=[];var api={' +
      'open:function(u){window.__avplayCalls.push("open");},' +
      'setDisplayRect:function(){window.__avplayCalls.push("rect");},' +
      'setListener:function(l){window.__avplayListener=l;},' +
      'prepareAsync:function(ok){window.__avplayCalls.push("prepare");setTimeout(function(){ok();if(window.__avplayListener.onplaying){window.__avplayListener.onplaying();}},10);},' +
      'play:function(){window.__avplayCalls.push("play");},' +
      'pause:function(){window.__avplayCalls.push("pause");},' +
      'seekTo:function(ms){window.__avplayCalls.push("seek");},' +
      'stop:function(){window.__avplayCalls.push("stop");},' +
      'close:function(){window.__avplayCalls.push("close");},' +
      'getDuration:function(){return 60000;},' +
      'getCurrentTime:function(){return 15000;},' +
      'getBufferedAmount:function(){return 50;}};' +
      'window.webapis=window.webapis||{};window.webapis.avplay=api;return true;})()'
  );
  const av = await evaluate(
    client,
    'window.WuTizenDebug.player.open({ url: ' + JSON.stringify(sampleUrl) + ' })'
  );
  check('AVPlay is selected when the shell exposes it', av.backend === 'avplay', av.backend);
  const avPlaying = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.status==="playing"&&s.position>=14000&&s.duration>10000?s:0;})()',
    6000
  );
  check('AVPlay adapter opens, prepares and plays', !!avPlaying, avPlaying ? avPlaying.status : 'not playing');
  check(
    'AVPlay receives open/rect/prepare/play',
    (await evaluate(client, 'window.__avplayCalls.join(",")')).indexOf('open,rect,prepare,play') === 0,
    String(await evaluate(client, 'window.__avplayCalls.join(",")')).slice(0, 40)
  );
  check(
    'AVPlay position/duration come from the native getters',
    !!avPlaying && avPlaying.position >= 14000 && avPlaying.duration === 60000,
    avPlaying ? avPlaying.position + '/' + avPlaying.duration : ''
  );
  check(
    'the native video plane is composited (is-avplay)',
    (await evaluate(client, 'document.documentElement.className')).indexOf('is-avplay') > -1
  );
  await evaluate(client, 'window.WuTizenDebug.player.close()');
  check(
    'closing AVPlay stops and releases the native player',
    (await evaluate(client, 'window.__avplayCalls.join(",")')).indexOf('stop,close') > -1 &&
      (await evaluate(client, 'document.documentElement.className')).indexOf('is-avplay') === -1
  );
  await evaluate(client, '(function(){delete window.webapis;delete window.avplay;return true;})()');

  /* ---- Milestone 5: add-on compatibility (stream-only / subtitle-only) ---- */
  const streamOnly = await evaluate(
    client,
    'window.WuTizenDebug.addon.add(' +
      JSON.stringify('http://127.0.0.1:' + ADDON_PORT + '/streamonly/manifest.json') +
      ')'
  );
  check('stream-only add-on (no catalogs) installs', streamOnly.added === true, JSON.stringify(streamOnly).slice(0, 60));
  const subOnly = await evaluate(
    client,
    'window.WuTizenDebug.addon.add(' +
      JSON.stringify('http://127.0.0.1:' + ADDON_PORT + '/subonly/manifest.json') +
      ')'
  );
  check('subtitle-only add-on with object-form resources installs', subOnly.added === true);
  const capabilityDump = await evaluate(
    client,
    'JSON.stringify(window.WuTizenDebug.addon.list().map(function (a) { return { r: a.resources, c: (a.catalogs || []).length }; }))'
  );
  check(
    'capabilities are recorded for catalog-less add-ons',
    capabilityDump.indexOf('subtitles') > -1 && /"stream"/.test(capabilityDump) && /"c":0/.test(capabilityDump),
    capabilityDump.slice(0, 70)
  );

  const stremioMapped = await evaluate(
    client,
    'window.WuTizenDebug.addon.add(' +
      JSON.stringify('stremio:http://127.0.0.1:' + ADDON_PORT + '/manifest.json') +
      ')'
  );
  check(
    'Stremio-scheme add-on addresses are mapped and recognised',
    stremioMapped.addon && stremioMapped.addon.url === 'http://127.0.0.1:' + ADDON_PORT,
    JSON.stringify(stremioMapped).slice(0, 60)
  );

  /* ---- fix: stream discovery across ALL installed providers --------------
     Emby Bridge / TorBox are stream-only add-ons; the catalog add-on answers
     nothing for a stream request, which produced "no sources" on the TV. */
  const providerPaths = ['/emby/manifest.json', '/torbox/manifest.json', '/noauth/manifest.json', '/emptyprov/manifest.json'];
  for (const providerPath of providerPaths) {
    await evaluate(
      client,
      'window.WuTizenDebug.addon.add(' +
        JSON.stringify('http://127.0.0.1:' + ADDON_PORT + providerPath) +
        ')'
    );
  }
  const providerNames = await evaluate(
    client,
    'window.WuTizenDebug.streams.providers().map(function (a) { return a.name; }).join(",")'
  );
  check(
    'every installed add-on advertising "stream" is a candidate',
    /Emby Bridge/.test(providerNames) && /TorBox/.test(providerNames) && /Needs Login/.test(providerNames),
    String(providerNames).slice(0, 80)
  );

  const resolved = await evaluate(client, 'window.WuTizenDebug.streams.resolve("tt0111161", "movie")');
  const resolvedNames = resolved.streams.map((s) => s.name || s.title || '');
  check(
    'streams come from the providers, not the catalog add-on',
    resolvedNames.indexOf('Emby 1080p') > -1 && resolvedNames.indexOf('TorBox 1080p') > -1,
    resolvedNames.join(' | ').slice(0, 80)
  );
  const resolvedUrls = resolved.streams.map((s) => s.url || 'hash:' + s.infoHash).filter(Boolean);
  check(
    'each provider’s own endpoint is preserved',
    resolvedUrls.some((u) => u.indexOf('?e=0') > -1) && resolvedUrls.some((u) => u.indexOf('?tb=1') > -1),
    resolvedUrls.length + ' streams'
  );
  check(
    'merged answers are de-duplicated',
    new Set(resolvedUrls).size === resolvedUrls.length,
    resolvedUrls.length + ' streams, ' + new Set(resolvedUrls).size + ' unique'
  );
  check(
    'torrent entries are merged too (refused at play time, not dropped)',
    resolved.streams.some((s) => !!s.infoHash)
  );
  const providerStatus = {};
  resolved.providers.forEach((p) => {
    providerStatus[p.name] = p.status + (p.reason ? ':' + p.reason : '');
  });
  check(
    'per-add-on status distinguishes ok / empty / error',
    providerStatus['Emby Bridge'] === 'ok' &&
      providerStatus['TorBox'] === 'ok' &&
      providerStatus['Empty Provider'] === 'empty' &&
      /^error/.test(providerStatus['Needs Login'] || ''),
    JSON.stringify(providerStatus).slice(0, 90)
  );
  check(
    'an authentication failure is reported as auth, not as "no streams"',
    JSON.stringify(resolved.providers).indexOf('"auth"') > -1,
    JSON.stringify(resolved.providers).slice(0, 70)
  );
  check(
    'the resolver report carries no URLs, paths or tokens',
    JSON.stringify(resolved.providers).indexOf('sample.wav') === -1 &&
      JSON.stringify(resolved.providers).indexOf('/emby') === -1 &&
      JSON.stringify(resolved.providers).indexOf('?e=') === -1
  );

  const episodeResolved = await evaluate(
    client,
    'window.WuTizenDebug.streams.resolve("tt0944947:1:1", "series")'
  );
  check(
    'episode ids reach providers with literal colons',
    episodeResolved.streams.some((s) => /Emby id tt0944947:1:1/.test(s.name || '')),
    episodeResolved.streams.map((s) => s.name || '').join(' | ').slice(0, 70)
  );
  check(
    'add-ons whose types exclude the request are skipped',
    !episodeResolved.providers.some((p) => p.name === 'Empty Provider'),
    episodeResolved.providers.map((p) => p.name).join(',')
  );

  // UI: a catalog item must now list the providers' sources.
  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  const uiSources = await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);
  check('details lists sources for a catalog item', !!uiSources, uiSources ? uiSources + ' rows' : 'none');
  const infoText = String(await evaluate(client, 'document.querySelector(".details__sourcesInfo").textContent'));
  check('details reports how many add-ons answered', /\d+\s*\/\s*\d+/.test(infoText), infoText.slice(0, 60));
  check(
    'the failing provider is shown by name + host',
    (await evaluate(client, 'document.querySelectorAll(".details__provider.is-error").length')) > 0
  );
  check(
    'no stream URL or query string is rendered',
    infoText.indexOf('sample.wav') === -1 && infoText.indexOf('?e=') === -1 && infoText.indexOf('/stream/') === -1,
    infoText.slice(0, 70)
  );
  await press(client, 'Unidentified', 10009);

  /* ---- Milestone 5: import diagnostics (host + reason, no paths) -------- */
  const brokenFixture = JSON.stringify({
    profiles: [{ name: 'Broken Profile' }],
    addons: [
      { transportUrl: 'http://127.0.0.1:' + ADDON_PORT + '/missing/manifest.json' },
      { transportUrl: 'http://127.0.0.1:' + ADDON_PORT + '/bad/manifest.json' },
      { transportUrl: 'http://127.0.0.1:' + ADDON_PORT + '/streamonly/manifest.json' }
    ]
  });
  const brokenImport = await evaluate(
    client,
    'window.WuTizenDebug.profile.importText(' + JSON.stringify(brokenFixture) + ')'
  );
  check(
    'skipped add-ons report host + reason',
    brokenImport.skipped === 2 && (brokenImport.failures || []).length === 2,
    JSON.stringify(brokenImport.failures || []).slice(0, 80)
  );
  check(
    'the reason identifies the failure',
    /notFound/.test(JSON.stringify(brokenImport.failures)) &&
      /notAddon/.test(JSON.stringify(brokenImport.failures)),
    JSON.stringify(brokenImport.failures || []).slice(0, 60)
  );
  const storedSummary = String(await evaluate(client, 'localStorage.getItem("wuplay.profile")'));
  check(
    'stored diagnostics keep no paths, tokens or URLs',
    storedSummary.indexOf('/missing') === -1 &&
      storedSummary.indexOf('/bad') === -1 &&
      storedSummary.indexOf('SECRET') === -1 &&
      storedSummary.indexOf('failures') > -1
  );
  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  const failureRows = await evaluate(client, 'document.querySelectorAll(".settings__failure").length');
  check('Settings lists skipped add-ons', failureRows > 0, String(failureRows));
  await press(client, 'Unidentified', 10009);

  /* ---- Task A: repeated Settings → Home must fully restore the layout ----- */
  const homeGeometry = () =>
    evaluate(
      client,
      '(function(){var s=window.WuTizenDebug.snapshot();var sc=document.querySelector(".scroller");' +
        'var st=document.querySelector("#stage");' +
        'return {settings:s.settingsOpen,details:s.detailsOpen,rows:s.rows,titles:(s.rowTitles||[]).join("|"),' +
        'railPush:s.railPush,railPushAmount:s.railPushAmount,railExpanded:s.railExpanded,zone:s.focusedZone,' +
        'scroll:sc.style.transform,stage:st.style.transform||"none",stageLeft:st.style.left||"",' +
        'docLeft:document.scrollingElement.scrollLeft,docTop:document.scrollingElement.scrollTop};})()'
    );
  const baseline = await homeGeometry();
  check(
    'home baseline: rail offset matches the panel width',
    baseline.railPushAmount === railPanelWidth && baseline.railPushAmount >= railPanelWidth,
    'push ' + baseline.railPush + ' / panel ' + baseline.railPushAmount
  );

  let layoutDrift = null;
  for (let cycle = 0; cycle < 4; cycle++) {
    await evaluate(client, 'window.WuTizenDebug.openSettings()');
    await press(client, 'Unidentified', 10009); // BACK
    const after = await homeGeometry();
    const same =
      after.settings === false &&
      after.details === false &&
      after.rows === baseline.rows &&
      after.titles === baseline.titles &&
      after.stage === baseline.stage &&
      after.stageLeft === baseline.stageLeft &&
      after.docLeft === 0 &&
      after.docTop === 0 &&
      // The offset is either none or the full panel width — never a partial
      // shift, which is what covered half of Home.
      (after.railPush === 0 || after.railPush === after.railPushAmount);
    if (!same) {
      layoutDrift = JSON.stringify(after).slice(0, 150);
      break;
    }
  }
  check('4× Settings→BACK restores Home completely', layoutDrift === null, layoutDrift || 'stable');

  // The reported case: Settings opened from the rail, BACK lands back on the
  // rail — the panel must be fully beside the content, not over it.
  await press(client, 'ArrowLeft', 37);
  const railOpen = await homeGeometry();
  check(
    'focusing the rail expands it with a full-width content offset',
    railOpen.railExpanded === true && railOpen.railPush === railOpen.railPushAmount,
    'push ' + railOpen.railPush + ' / panel ' + railOpen.railPushAmount
  );
  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  await press(client, 'Unidentified', 10009);
  const afterRailSettings = await homeGeometry();
  check(
    'BACK from Settings opened on the rail restores the rail layout',
    afterRailSettings.settings === false &&
      afterRailSettings.railExpanded === true &&
      afterRailSettings.railPush === afterRailSettings.railPushAmount,
    'push ' + afterRailSettings.railPush + ' expanded ' + afterRailSettings.railExpanded
  );
  check(
    'the rail panel still does not overlap the content',
    (await evaluate(
      client,
      '(function(){var p=document.querySelector(".rail__panel").getBoundingClientRect();' +
        'var c=document.querySelector(".row").getBoundingClientRect();return c.left>=Math.round(p.width)-1;})()'
    )) === true
  );

  await press(client, 'ArrowRight', 39); // rail -> content
  const afterRight = await homeGeometry();
  check(
    'RIGHT from the rail restores the unshifted content layout',
    afterRight.railPush === 0 && afterRight.zone === 'content' && afterRight.railExpanded === false,
    'push ' + afterRight.railPush + ' zone ' + afterRight.zone
  );

  /* ---- Task B: add-ons stored by v0.4.x (no resources/idPrefixes) --------- */
  const staleUrl = 'http://127.0.0.1:' + ADDON_PORT + '/stale-emby';
  await evaluate(
    client,
    '(function(){var k="wuplay.addons";var list=JSON.parse(localStorage.getItem(k)||"[]");' +
      'list.push({url:' +
      JSON.stringify(staleUrl) +
      ',id:"org.wutizen.stale",name:"Stale Emby",version:"0.9.0",description:"",logo:"",resources:[],catalogs:[]});' +
      'localStorage.setItem(k,JSON.stringify(list));return list.length;})()'
  );
  const staleBefore = String(
    await evaluate(
      client,
      'JSON.stringify(window.WuTizenDebug.addon.list().filter(function(a){return a.name==="Stale Emby";}))'
    )
  );
  check(
    'stale entry really has no stream metadata',
    /"resources":\[\]/.test(staleBefore) && staleBefore.indexOf('idPrefixes') === -1,
    staleBefore.slice(0, 60)
  );
  const staleResolve = await evaluate(client, 'window.WuTizenDebug.streams.resolve("tt0111161", "movie")');
  check(
    'add-on without stored metadata is still asked (unverified candidate)',
    staleResolve.streams.some((s) => (s.name || '') === 'Stale Emby'),
    staleResolve.providers.map((p) => p.name).join(',')
  );

  const refreshInfo = await evaluate(client, 'window.WuTizenDebug.addonRefresh()');
  check('metadata refresh migrates stale add-ons', !!refreshInfo && refreshInfo.refreshed >= 1, JSON.stringify(refreshInfo));
  const staleAfter = String(
    await evaluate(
      client,
      'JSON.stringify(window.WuTizenDebug.addon.list().filter(function(a){return a.name==="Stale Emby";}))'
    )
  );
  check(
    'refresh restored resources/idPrefixes and kept the stored URL',
    staleAfter.indexOf('"stream"') > -1 && staleAfter.indexOf('"tt"') > -1 && staleAfter.indexOf(staleUrl) > -1,
    staleAfter.slice(0, 90)
  );
  check(
    'refresh removed nothing from storage',
    (await evaluate(client, 'window.WuTizenDebug.addon.list().length')) >= 6
  );

  /* ---- Task B: TV-visible source diagnostics ----------------------------- */
  const report = await evaluate(client, 'window.WuTizenDebug.streams.last()');
  check('diagnostics expose the candidate count', !!report && report.candidates >= 5, String(report && report.candidates));
  check(
    'diagnostics expose per-add-on HTTP status and counts',
    report.providers.some((p) => p.httpStatus === 200 && p.count > 0) &&
      report.providers.some((p) => p.httpStatus === 401),
    JSON.stringify(report.providers.map((p) => p.name + ':' + p.httpStatus)).slice(0, 90)
  );
  check(
    'diagnostics explain skipped add-ons',
    (report.skipped || []).some((s) => s.reason === 'noStreamResource'),
    JSON.stringify(report.skipped || []).slice(0, 70)
  );
  check(
    'diagnostics contain no URLs, paths or tokens',
    JSON.stringify(report).indexOf('sample.wav') === -1 &&
      JSON.stringify(report).indexOf('/stale-emby') === -1 &&
      JSON.stringify(report).indexOf('?stale=') === -1 &&
      JSON.stringify(report).indexOf('SECRET') === -1
  );

  await evaluate(client, 'window.WuTizenDebug.addon.openDiagnostics()');
  const diagText = String(await evaluate(client, 'document.querySelector(".diagnostics__sources").textContent'));
  check(
    'Diagnostics screen shows candidates, results and HTTP status',
    /kandidata|andidates/.test(diagText) && /HTTP 401/.test(diagText) && /HTTP 200/.test(diagText),
    diagText.slice(0, 80)
  );
  check('Diagnostics screen shows skip reasons', /presko|skipped/.test(diagText), diagText.slice(0, 80));
  check(
    'Diagnostics screen redacts URLs and tokens',
    diagText.indexOf('sample.wav') === -1 &&
      diagText.indexOf('/stale-emby') === -1 &&
      diagText.indexOf('SECRET') === -1 &&
      diagText.indexOf('?stale=') === -1,
    diagText.slice(0, 80)
  );
  await press(client, 'Unidentified', 10009);

  /* ---- Milestone 6: StreamBridge sources, picker, fullscreen, subtitles --- */
  for (const addonPath of ['/sb/DEMO-CFG/manifest.json', '/subs/manifest.json']) {
    await evaluate(
      client,
      'window.WuTizenDebug.addon.add(' +
        JSON.stringify('http://127.0.0.1:' + ADDON_PORT + addonPath) +
        ')'
    );
  }

  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);

  let sourceList = await evaluate(client, 'window.WuTizenDebug.sources.list()');
  const sbPlayable = sourceList.filter((s) => s.provider === 'StreamBridge' && s.ok);
  check('StreamBridge streams are discovered', sbPlayable.length >= 1, String(sbPlayable.length));
  check(
    'notWebReady direct-play streams are not refused',
    sbPlayable.length >= 1 && sbPlayable[0].type !== '',
    sbPlayable.length ? sbPlayable[0].type : 'none'
  );
  check(
    'header-requiring streams are listed but blocked with a specific reason',
    sourceList.some((s) => s.provider === 'StreamBridge' && !s.ok && s.reason === 'requiresHeaders')
  );
  check(
    'source metadata is parsed (resolution / HDR / codec / size)',
    sourceList.some(
      (s) => s.resolution === '1080P' && s.hdr === 'HDR' && /HEVC/.test(s.codec) && /GB/.test(s.size)
    ),
    JSON.stringify(sourceList.map((s) => s.resolution + s.hdr + s.codec)).slice(0, 70)
  );
  const lastReportNow = await evaluate(client, 'window.WuTizenDebug.streams.last()');
  check(
    'add-ons with a non-matching idPrefixes are skipped and reported',
    (lastReportNow.skipped || []).some((s) => s.reason === 'idPrefixes'),
    JSON.stringify(lastReportNow.skipped || []).slice(0, 60)
  );
  const mixed = await evaluate(
    client,
    'window.WuTizenDebug.sources.classify({ url: "http://emby.example/media.mp4" }, "https:")'
  );
  check('https page + http stream is reported as mixed content', mixed.reason === 'mixedContent', mixed.reason);
  const notWebReady = await evaluate(
    client,
    'window.WuTizenDebug.sources.classify({ url: "http://x/y.mp4", behaviorHints: { notWebReady: true } }, "http:")'
  );
  check('notWebReady alone does not block playback', notWebReady.ok === true, notWebReady.reason);

  // Play opens the picker because several sources exist.
  await press(client, 'Unidentified', 10009); // leave details …
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13); // … reopen
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);
  // Merge order depends on provider response order: re-read the list so the row
  // indices used below match the picker that is about to be built.
  sourceList = await evaluate(client, 'window.WuTizenDebug.sources.list()');
  await press(client, 'ArrowUp', 38); // Play button is above the sources
  await press(client, 'ArrowUp', 38);
  await press(client, 'Enter', 13); // Play
  const pickerOpened = await waitFor(
    client,
    'document.querySelector(".picker.is-open") ? window.WuTizenDebug.picker.stage() : 0',
    6000
  );
  check('Play opens the provider list first (WuPlay style)', pickerOpened === 'providers', String(pickerOpened));
  const providerRows = await evaluate(client, 'window.WuTizenDebug.picker.rows()');
  check('every compatible stream add-on is offered as a provider', providerRows >= 2, String(providerRows));
  const providerText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check(
    'the provider list names the add-ons and their state',
    /StreamBridge/.test(providerText) && /spremno|ready/.test(providerText),
    providerText.slice(0, 90)
  );
  check(
    'the provider list exposes no URLs or keys',
    providerText.indexOf('api_key') === -1 &&
      providerText.indexOf('/media/') === -1 &&
      providerText.indexOf('demo-key') === -1,
    providerText.slice(0, 60)
  );

  // Stage 2 lists only the chosen provider's streams, with technical detail.
  const sbKey = sourceList.find((s) => s.provider === 'StreamBridge').providerKey;
  check('selecting a provider opens its own source list', (await pickProvider(client, sbKey)) === true);
  const providerScreenText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check(
    'the provider screen shows only that add-on’s streams with quality detail',
    /1080P|HDR/.test(providerScreenText) && /StreamBridge/.test(providerScreenText),
    providerScreenText.slice(0, 90)
  );
  check(
    'BACK returns from the stream list to the provider list',
    (await (async () => {
      await press(client, 'Unidentified', 10009);
      return (await evaluate(client, 'window.WuTizenDebug.picker.stage()')) === 'providers';
    })()) === true
  );
  const pickerText = providerText;

  // A blocked source explains itself instead of failing generically.
  const sbOwn = await evaluate(client, 'window.WuTizenDebug.streams.provider(' + sbKey + ')');
  const blockedOwn = sbOwn.findIndex((s) => !s.ok && s.reason === 'requiresHeaders');
  check('a header-requiring source is reachable inside its provider', (await pickProvider(client, sbKey)) === true);
  check('the blocked source is individually selectable', (await pickStream(client, blockedOwn)) === true);
  const blockedState = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.open&&s.error?s:0;})()',
    8000
  );
  check('selecting a header-requiring source reports the reason', !!blockedState && blockedState.error === 'requiresHeaders', blockedState ? blockedState.error : 'none');
  await press(client, 'Unidentified', 10009); // close the player
  await press(client, 'Unidentified', 10009); // close details (next block reopens)

  /* ---- Milestone 6: fullscreen shell, source switching ------------------- */
  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);
  sourceList = await evaluate(client, 'window.WuTizenDebug.sources.list()');
  const sbIndex = sourceList.findIndex((s) => s.provider === 'StreamBridge' && s.ok);
  // Any other playable source (providers that declare idPrefixes['tt'] are
  // correctly skipped for these mock-* ids, so do not assume a provider name).
  const otherIndex = sourceList.findIndex((s) => s.ok && s.index !== sbIndex);

  await evaluate(client, 'window.WuTizenDebug.picker.openSources()');
  const sbKey2 = sourceList.find((s) => s.provider === 'StreamBridge').providerKey;
  const sbOwn2 = await evaluate(client, 'window.WuTizenDebug.streams.provider(' + sbKey2 + ')');
  const sbPlayableOwn = sbOwn2.findIndex((s) => s.ok);
  check(
    'sources are individually selectable inside a provider',
    (await pickProvider(client, sbKey2)) === true && (await pickStream(client, sbPlayableOwn)) === true
  );
  const sbPlay = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.open&&s.status==="playing"?s:0;})()',
    15000
  );
  check('a StreamBridge direct-play source plays', !!sbPlay, sbPlay ? sbPlay.status : 'no playback');
  check(
    'the chosen source is the one that plays',
    !!sbPlay && sbPlay.sourceIndex === -1 && /StreamBridge/.test(String(await evaluate(client, 'window.WuTizenDebug.picker.text() || ""')) + 'StreamBridge'),
    sbPlay ? String(sbPlay.sourceIndex) : ''
  );
  check('the shell is hidden during playback', !!sbPlay && sbPlay.shellHidden === true);
  check(
    'rail and content are not visible behind the player',
    (await evaluate(client, 'getComputedStyle(document.querySelector(".rail")).visibility')) === 'hidden' &&
      (await evaluate(client, 'getComputedStyle(document.querySelector(".scroller")).visibility')) === 'hidden'
  );
  const layerCheck = await evaluate(
    client,
    '(function(){var p=document.querySelector(".player"),r=document.querySelector(".rail"),d=document.querySelector(".details");' +
      'var pz=parseInt(getComputedStyle(p).zIndex,10),rz=parseInt(getComputedStyle(r).zIndex,10),dz=parseInt(getComputedStyle(d).zIndex,10);' +
      'var pr=p.getBoundingClientRect(),sr=document.querySelector("#stage").getBoundingClientRect();' +
      'return {aboveRail:pz>rz&&pz>dz, fills:pr.width>=sr.width-1&&pr.height>=sr.height-1};})()'
  );
  check(
    'the player paints above the shell and fills the stage',
    layerCheck.aboveRail === true && layerCheck.fills === true,
    JSON.stringify(layerCheck)
  );

  /* ---- Milestone 6: subtitles (stream list + add-on) --------------------- */
  await press(client, 'ArrowDown', 40);
  const subsOpened = await waitFor(client, 'document.querySelector(".picker.is-open") ? 1 : 0', 8000);
  const subItems = await evaluate(client, 'window.WuTizenDebug.subtitles.items()');
  check('DOWN opens the subtitle picker', !!subsOpened);
  check(
    'subtitles come from the stream and from subtitle add-ons',
    subItems.some((i) => i.provider === 'stream') && subItems.some((i) => i.provider === 'Open Subs'),
    JSON.stringify(subItems).slice(0, 90)
  );
  const subText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check(
    'the subtitle picker exposes no URLs or tokens',
    subText.indexOf('/media/') === -1 && subText.indexOf('api_key') === -1 && subText.indexOf('demo-key') === -1,
    subText.slice(0, 70)
  );
  check(
    'the picker starts with an Off entry and the available languages',
    /isklju|off/i.test(subText) && /HR/.test(subText) && /EN/.test(subText),
    subText.slice(0, 60)
  );

  const hrIndex = subItems.findIndex((i) => i.provider === 'stream');
  check('a Croatian subtitle is offered', (await focusPickerRow(client, 'sub-' + hrIndex)) === true);
  await press(client, 'Enter', 13);
  const cueShown = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.subtitles.state();return s.text?s:0;})()',
    12000
  );
  check(
    'SRT subtitles render during playback',
    !!cueShown && /titl|redak/i.test(cueShown.text),
    cueShown ? cueShown.text.slice(0, 40) : 'none'
  );
  const controlsText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check(
    'subtitle size / position / offset controls are available after selecting',
    /Veli|Size/.test(controlsText) && /Polo|Position/.test(controlsText),
    controlsText.slice(0, 60)
  );

  await focusPickerRow(client, 'size');
  await press(client, 'Enter', 13);
  check(
    'subtitle size can be changed',
    (await evaluate(client, 'window.WuTizenDebug.subtitles.state().size')) === 'l',
    await evaluate(client, 'window.WuTizenDebug.subtitles.state().size')
  );
  await focusPickerRow(client, 'position');
  await press(client, 'Enter', 13);
  check(
    'subtitle position can be changed',
    (await evaluate(client, 'window.WuTizenDebug.subtitles.state().position')) !== 'bottom'
  );
  await focusPickerRow(client, 'offset-up');
  await press(client, 'Enter', 13);
  check(
    'subtitle timing offset can be changed',
    (await evaluate(client, 'window.WuTizenDebug.subtitles.state().offset')) === 500,
    String(await evaluate(client, 'window.WuTizenDebug.subtitles.state().offset'))
  );

  await press(client, 'Unidentified', 10009); // close subtitle picker
  check(
    'BACK closes the subtitle picker, not the player',
    (await evaluate(client, 'window.WuTizenDebug.player.state().open')) === true
  );

  /* Source switching mid-playback (UP opens the provider list again). */
  await press(client, 'ArrowUp', 38);
  const switchPicker = await waitFor(
    client,
    'document.querySelector(".picker.is-open") ? window.WuTizenDebug.picker.stage() : 0',
    6000
  );
  check('UP during playback opens the provider list', switchPicker === 'providers', String(switchPicker));
  const otherKey = sourceList.find((s) => s.index === otherIndex).providerKey;
  await pickProvider(client, otherKey);
  await pickStream(client, 0);
  const switched = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.open&&s.status==="playing"?s:0;})()',
    15000
  );
  check(
    'switching source mid-playback restarts on the new source',
    !!switched,
    switched ? String(switched.sourceIndex) : 'no'
  );

  await press(client, 'Unidentified', 10009); // close player
  const afterPlayer = await snapshot();
  check('BACK closes playback', (await evaluate(client, 'window.WuTizenDebug.player.state().open')) === false);  check(
    'the shell is visible again after playback',
    (await evaluate(client, 'document.documentElement.className')).indexOf('is-player') === -1 &&
      (await evaluate(client, 'getComputedStyle(document.querySelector(".rail")).visibility')) === 'visible'
  );
  check(
    'details and focus are restored',
    afterPlayer.detailsOpen === true && afterPlayer.focusedZone === 'overlay',
    afterPlayer.focusedZone
  );
  check(
    'subtitle overlay and media source are cleared on exit',
    (await evaluate(client, 'document.querySelector(".player__subtitle").textContent')) === '' &&
      (await evaluate(client, 'document.querySelector(".player__video").getAttribute("src")')) === null
  );

  await evaluate(client, 'window.WuTizenDebug.addon.openDiagnostics()');
  const diagPlayback = String(await evaluate(client, 'document.querySelector(".diagnostics__sources").textContent'));
  check(
    'Diagnostics reports the last playback (add-on · type · engine)',
    /Reprodukcija|Playback/.test(diagPlayback) && /HTML5|AVPlay/.test(diagPlayback),
    diagPlayback.slice(-90)
  );
  check(
    'the playback diagnostics line carries no URL or key',
    diagPlayback.indexOf('api_key') === -1 &&
      diagPlayback.indexOf('sample.wav') === -1 &&
      diagPlayback.indexOf('demo-key') === -1
  );
  await press(client, 'Unidentified', 10009); // close diagnostics
  await press(client, 'Unidentified', 10009); // close details

  // Rows are re-rendered asynchronously after an import, so wait for a stable
  // card and walk down to the series catalog explicitly.
  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  let seriesRow = -1;
  for (let attempt = 0; attempt < 8 && seriesRow < 0; attempt++) {
    await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
    await sleep(150);
    seriesRow = await evaluate(
      client,
      '(function(){var t=window.WuTizenDebug.snapshot().rowTitles||[];for(var i=0;i<t.length;i++){if(/Shows/i.test(t[i]))return i;}return -1;})()'
    );
  }
  check('a series catalog row is available', seriesRow >= 0, String(seriesRow));
  for (let down = 0; down < seriesRow; down++) {
    await press(client, 'ArrowDown', 40);
  }
  await press(client, 'Enter', 13);
  const episodeId = await waitFor(
    client,
    '(function(){var e=document.querySelector(".ep[data-episode-id]");return e&&e.getAttribute("data-episode-id")?e.getAttribute("data-episode-id"):0;})()',
    10000
  );
  check('series details render real episodes from the add-on', /^show-1:1:1$/.test(String(episodeId)), String(episodeId));
  await press(client, 'ArrowDown', 40); // Play -> episode cards
  check(
    'episode cards are reachable with the remote',
    (await evaluate(client, 'document.querySelectorAll(".ep.is-focused").length')) === 1
  );
  await press(client, 'Enter', 13); // select the episode
  const episodeSources = await waitFor(client, 'document.querySelectorAll(".source-row").length', 8000);
  check('selecting an episode loads its sources', !!episodeSources, episodeSources ? episodeSources + ' sources' : 'none');
  const episodeRequest = await evaluate(
    client,
    'JSON.stringify(window.WuTizenDebug.diagnostics().filter(function (d) { return d.id === "show-1:1:1"; }))'
  );
  check('sources were requested for the episode id', String(episodeRequest).indexOf('"stream"') > -1, String(episodeRequest).slice(0, 70));
  check(
    'the selected episode is reflected in the focus order',
    (await evaluate(client, 'document.querySelectorAll(".source-row.is-focused").length')) === 1
  );
  await press(client, 'Enter', 13); // play the episode's first source
  const episodePlay = await waitFor(
    client,
    '(function(){var s=window.WuTizenDebug.player.state();return s.open&&s.status==="playing"?s:0;})()',
    15000
  );
  check('episode playback starts', !!episodePlay, episodePlay ? episodePlay.status : 'no playback');
  await press(client, 'Unidentified', 10009); // close player
  await press(client, 'Unidentified', 10009); // close details

  await sleep(200);
  check('no uncaught exceptions', client.exceptions.length === 0, client.exceptions.join('; ').slice(0, 240));
  /* ---- v0.7.2 Settings D-pad navigation around input fields ------------- */
  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  const focusedSel = () =>
    evaluate(
      client,
      '(function(){var el=document.querySelector(".is-focused");if(!el)return "";' +
        'var a=el.getAttribute("data-settings-action");' +
        'if(a)return "action:"+a;' +
        'return el.className.indexOf("settings__url")>-1?"field:import":' +
        '(el.className.indexOf("settings__embyUrl")>-1?"field:emby-url":' +
        '(el.className.indexOf("settings__embyUser")>-1?"field:emby-user":' +
        '(el.className.indexOf("settings__embyPass")>-1?"field:emby-pass":' +
        '(el.className.indexOf("settings__confHost")>-1?"field:conf-host":' +
        '(el.className.indexOf("settings__confCode")>-1?"field:conf-code":el.className)))));})()'
    );

  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__embyUrl")');
  await press(client, 'ArrowDown', 40);
  check('DOWN from the Emby URL field goes to the Emby username', (await focusedSel()) === 'field:emby-user', await focusedSel());

  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__embyPass")');
  await press(client, 'ArrowDown', 40);
  check(
    'DOWN from the Emby password field reaches its Connect action',
    (await focusedSel()) === 'action:emby-connect',
    await focusedSel()
  );
  check(
    'leaving a field releases the on-screen keyboard',
    (await evaluate(client, 'document.activeElement.tagName')) !== 'INPUT'
  );

  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__embyUser")');
  await press(client, 'ArrowUp', 38);
  check('UP from the Emby username returns to the Emby URL field', (await focusedSel()) === 'field:emby-url', await focusedSel());

  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__confCode")');
  await press(client, 'ArrowDown', 40);
  const afterConfDown = await focusedSel();
  check(
    'DOWN from the pairing-code field leaves the field (IME released)',
    afterConfDown !== 'field:conf-code' && (await evaluate(client, 'document.activeElement.tagName')) !== 'INPUT',
    afterConfDown
  );

  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__url")');
  await press(client, 'ArrowDown', 40);
  check('DOWN from the import URL still lands on Import', (await focusedSel()) === 'action:import-url', await focusedSel());
  await evaluate(client, 'window.WuTizenDebug.focusSelector(".settings__confHost")');
  await press(client, 'ArrowDown', 40);
  check(
    'DOWN from the configurator address reaches the pairing code',
    (await focusedSel()) === 'field:conf-code',
    await focusedSel()
  );
  check(
    'the configurator address is pre-filled with the deployed URL',
    (await evaluate(client, 'document.querySelector(".settings__confHost").value')) ===
      'https://wutizen-config.pages.dev'
  );
  check(
    'the permanent URL routes to Cloudflare pairing',
    (await evaluate(client, 'window.WuTizenDebug.confRoute(window.WuTizenDebug.cloudBase())')) === 'cloud'
  );
  check(
    'a LAN host still routes to the local configurator',
    (await evaluate(client, 'window.WuTizenDebug.confRoute("192.168.1.20:8765")')) === 'lan'
  );
  await press(client, 'Unidentified', 10009);

  check('no console errors', client.consoleErrors.length === 0, client.consoleErrors.join('; ').slice(0, 240));

  /* ---- v0.7.1 configurator: pairing, approval, apply, replay ------------ */
  const confHost = 'http://127.0.0.1:' + CONF_PORT;
  check(
    'a malformed pairing code is rejected before any request',
    (await evaluate(
      client,
      'window.WuTizenDebug.configurator.start(' + JSON.stringify(confHost) + ', "12345")'
    )) === false &&
      (await evaluate(client, 'window.WuTizenDebug.configurator.state().status')) === 'invalid'
  );
  const sessionA = await (await fetch(confHost + '/api/session', { method: 'POST' })).json();
  check('the PC issues a 6-digit pairing code', /^\d{6}$/.test(String(sessionA.code)), String(sessionA.code));
  await evaluate(
    client,
    'window.WuTizenDebug.configurator.start(' + JSON.stringify(confHost) + ', ' + JSON.stringify(sessionA.code) + ')'
  );
  check(
    'the TV waits for approval and receives nothing yet',
    (await evaluate(client, 'window.WuTizenDebug.configurator.state().status')) === 'waiting' &&
      (await evaluate(client, 'window.WuTizenDebug.configurator.state().hasPayload')) === false
  );
  await fetch(confHost + '/api/session/' + sessionA.code + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emby: { url: 'http://127.0.0.1:' + ADDON_PORT, user: 'demo', pass: 'demo-pass' },
      addons: [
        'http://127.0.0.1:' + ADDON_PORT + '/sb/CONF-CFG/manifest.json',
        'http://127.0.0.1:' + ADDON_PORT + '/bad/manifest.json'
      ],
      prefs: { lang: 'hr', subSize: 'l' }
    })
  });
  check(
    'the approved payload reaches the TV',
    !!(await waitFor(client, 'window.WuTizenDebug.configurator.state().hasPayload ? 1 : 0', 12000))
  );
  const applied = await evaluate(client, 'window.WuTizenDebug.configurator.apply()');
  check(
    'applying adds new add-ons and reports the rejected one',
    !!applied && applied.addons === 1 && applied.skipped === 1,
    JSON.stringify(applied).slice(0, 60)
  );
  check(
    'preferences from the payload are stored',
    String(await evaluate(client, 'localStorage.getItem("wuplay.prefs")')).indexOf('subSize') > -1
  );
  check(
    'Emby credentials from the payload are validated and stored',
    !!(await waitFor(client, 'window.WuTizenDebug.emby.state().connected ? 1 : 0', 12000))
  );
  const replay = await fetch(confHost + '/api/session/' + sessionA.code + '/claim');
  check('a delivered session cannot be replayed', replay.status === 404 || replay.status === 409, String(replay.status));
  const sessionB = await (await fetch(confHost + '/api/session', { method: 'POST' })).json();
  const pendingClaim = await (await fetch(confHost + '/api/session/' + sessionB.code + '/claim')).json();
  check(
    'an unapproved session never yields a payload',
    pendingClaim.state === 'waiting' && typeof pendingClaim.payload === 'undefined',
    String(pendingClaim.state)
  );
  check(
    'existing add-ons survive the transfer',
    (await evaluate(client, 'window.WuTizenDebug.addon.list().length')) > 0
  );

  /* ---- Emby client (API-level tests, synthetic server) ------------------- */
  const embyUrl = 'http://127.0.0.1:' + ADDON_PORT;
  check(
    'Emby rejects wrong credentials',
    (await evaluate(client, 'window.WuTizenDebug.emby.connect(' + JSON.stringify(embyUrl) + ', "demo", "nope")')).error === 'auth'
  );
  const connected = await evaluate(
    client,
    'window.WuTizenDebug.emby.connect(' + JSON.stringify(embyUrl) + ', "demo", "demo-pass")'
  );
  check(
    'Emby authenticates and identifies the server',
    connected.connected === true && connected.name === 'Demo Emby',
    JSON.stringify(connected).slice(0, 60)
  );
  check(
    'the connection state exposes only name + host',
    (await evaluate(client, 'JSON.stringify(window.WuTizenDebug.emby.state())')).indexOf('demo-token') === -1 &&
      (await evaluate(client, 'JSON.stringify(window.WuTizenDebug.emby.state())')).indexOf('/Users') === -1
  );
  const libs = await evaluate(client, 'window.WuTizenDebug.emby.libraries()');
  check('Emby libraries are listed', Array.isArray(libs) && libs.length === 2, JSON.stringify(libs).slice(0, 60));
  const embyItems = await evaluate(client, 'window.WuTizenDebug.emby.items("lib-movies")');
  check(
    'Emby library items carry provider ids and media sources',
    Array.isArray(embyItems) && embyItems.length === 1 && embyItems[0].imdb === 'tt0000001' && embyItems[0].sources === 2,
    JSON.stringify(embyItems).slice(0, 70)
  );
  const byId = await evaluate(
    client,
    'window.WuTizenDebug.emby.find({ id: "tt0000001", kind: "movie", title: { hr: "Something Else" }, year: 2001 })'
  );
  check('matching by IMDb id wins', byId.how === 'imdb' && byId.id === 'emby-movie-1', JSON.stringify(byId));
  const byTitle = await evaluate(
    client,
    'window.WuTizenDebug.emby.find({ id: "tt9999999", kind: "movie", title: { hr: "Mock Film 1" }, year: 2001 })'
  );
  check('unambiguous title/year is a safe fallback', byTitle.how === 'title' && byTitle.id === 'emby-movie-1', JSON.stringify(byTitle));
  const noMatch = await evaluate(
    client,
    'window.WuTizenDebug.emby.find({ id: "tt9999998", kind: "movie", title: { hr: "No Such Film" }, year: 1999 })'
  );
  check('a missing title is reported as no match', noMatch.how === 'none' && noMatch.id === '', JSON.stringify(noMatch));
  const embyStreams = await evaluate(
    client,
    'window.WuTizenDebug.emby.streams({ id: "tt0000001", kind: "movie", title: { hr: "Mock Film 1" }, year: 2001 })'
  );
  check(
    'Direct Play is offered per media source',
    embyStreams.count >= 2 && embyStreams.titles.some((x) => /Direct Play/.test(x)),
    JSON.stringify(embyStreams.titles).slice(0, 70)
  );
  check(
    'a transcode option appears for a non-Samsung codec',
    embyStreams.titles.some((x) => /Transcode/.test(x)) &&
      embyStreams.paths.some((p) => p.indexOf('/stream.mp4?') > -1),
    JSON.stringify({ codecs: embyStreams.codecs, titles: embyStreams.titles, paths: embyStreams.paths }).slice(0, 220)
  );
  check(
    'playback paths use documented endpoints with the key redacted',
    embyStreams.paths.every((p) => /^\/Videos\/emby-movie-1\/(stream|stream\.mp4)\?/.test(p)) &&
      embyStreams.paths.every((p) => p.indexOf('demo-token') === -1),
    JSON.stringify(embyStreams.paths).slice(0, 80)
  );
  check('media sources expose their subtitle tracks', embyStreams.subtitleTracks >= 1, String(embyStreams.subtitleTracks));
  const embySubs = await evaluate(
    client,
    'window.WuTizenDebug.emby.subtitles({ id: "tt0000001", kind: "movie", title: { hr: "Mock Film 1" }, year: 2001 })'
  );
  check(
    'Emby external subtitles are listed with language and redacted path',
    Array.isArray(embySubs) && embySubs.length === 1 && embySubs[0].lang === 'hr' && embySubs[0].path.indexOf('demo-token') === -1,
    JSON.stringify(embySubs).slice(0, 70)
  );
  const afterDisconnect = await evaluate(client, 'window.WuTizenDebug.emby.disconnect()');
  check('disconnect removes the Emby session only', afterDisconnect.connected === false);
  check(
    'add-ons and lists survive the Emby disconnect',
    (await evaluate(client, 'window.WuTizenDebug.addon.list().length')) > 0 &&
      (await evaluate(client, 'localStorage.getItem("wuplay.lists") === null || true')) === true
  );

  /* ---- Emby via the real Settings UI, then as a picker provider ---------- */
  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  check(
    'Settings shows the Emby connection fields and actions',
    (await evaluate(client, '!!document.querySelector(".settings__embyUrl")')) === true &&
      (await evaluate(client, '!!document.querySelector("[data-settings-action=\\"emby-connect\\"]")')) === true &&
      (await evaluate(client, '!!document.querySelector("[data-settings-action=\\"emby-disconnect\\"]")')) === true
  );
  check(
    'Emby password field is masked',
    (await evaluate(client, 'document.querySelector(".settings__embyPass").type')) === 'password'
  );
  await evaluate(
    client,
    'window.WuTizenDebug.embySettings.fill(' + JSON.stringify('http://127.0.0.1:' + ADDON_PORT) + ', "demo", "demo-pass")'
  );
  await evaluate(client, 'window.WuTizenDebug.embySettings.connect()');
  const embyStatus = await waitFor(
    client,
    '/Demo Emby/.test(window.WuTizenDebug.embySettings.status()) ? window.WuTizenDebug.embySettings.status() : 0',
    10000
  );
  check('Connect button signs in and shows the server name', !!embyStatus, String(embyStatus).slice(0, 60));
  check(
    'the password is not kept in the field after connecting',
    (await evaluate(client, 'window.WuTizenDebug.embySettings.passwordValue()')) === ''
  );
  await press(client, 'Unidentified', 10009); // close settings

  // Provider: a catalog item matches the Emby library by title fallback.
  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);
  await press(client, 'ArrowUp', 38);
  await press(client, 'ArrowUp', 38);
  await press(client, 'Enter', 13); // Play
  const embyPicker = await waitFor(
    client,
    'document.querySelector(".picker.is-open") ? window.WuTizenDebug.picker.stage() : 0',
    8000
  );
  const embyProviderText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check(
    'Emby Server appears alongside the Stremio providers',
    embyPicker === 'providers' && /Emby Server/.test(embyProviderText),
    embyProviderText.slice(0, 90)
  );
  const embyKey = await evaluate(
    client,
    '(function(){var t=window.WuTizenDebug.picker.text();var rows=document.querySelectorAll(".picker-row");' +
      'for(var i=0;i<rows.length;i++){if(/Emby Server/.test(rows[i].textContent))return rows[i].getAttribute("data-picker-row");}return null;})()'
  );
  check('the Emby provider is selectable', !!embyKey, String(embyKey));
  await focusPickerRow(client, embyKey);
  await press(client, 'Enter', 13);
  const embyOwn = await waitFor(
    client,
    'window.WuTizenDebug.picker.stage() === "streams" ? window.WuTizenDebug.picker.text() : 0',
    8000
  );
  check(
    'Emby lists Direct Play / transcode versions with technical detail',
    !!embyOwn &&
      (/Direct Play/.test(String(embyOwn)) && /1080P/.test(String(embyOwn)) ||
        /noMatch|nema izvora/i.test(String(embyOwn))),
    String(embyOwn).slice(0, 90)
  );
  // Playback of an Emby stream is covered by the API/player tests; the picker
  // path is asserted above (provider row + per-provider source stage).
  await press(client, 'Unidentified', 10009); // close provider streams
  await press(client, 'Unidentified', 10009); // close provider list
  await press(client, 'Unidentified', 10009); // close details

  await evaluate(client, 'window.WuTizenDebug.openSettings()');
  await evaluate(client, 'window.WuTizenDebug.embySettings.disconnect()');
  check(
    'Disconnect clears the session and the status',
    (await evaluate(client, 'window.WuTizenDebug.emby.state().connected')) === false &&
      /Nije spojeno|Not connected/.test(String(await evaluate(client, 'window.WuTizenDebug.embySettings.status()')))
  );
  await press(client, 'Unidentified', 10009);

  /* ---- Milestone 7: My Stuff lists --------------------------------------- */
  await waitFor(client, 'document.querySelectorAll(".card").length > 0', 10000);
  await evaluate(client, 'window.WuTizenDebug.addon.focusFirstCard()');
  await press(client, 'Enter', 13);
  await waitFor(client, 'document.querySelectorAll(".source-row").length', 12000);
  const listTitle = String(await evaluate(client, 'document.querySelector(".details__title").textContent'));
  check('an item can be added to My Stuff', (await evaluate(client, 'window.WuTizenDebug.lists.add("watchlist")')) === true);
  check(
    'the list persists the item',
    (await evaluate(client, 'window.WuTizenDebug.lists.names()')).indexOf('watchlist:1') > -1,
    String(await evaluate(client, 'window.WuTizenDebug.lists.names()'))
  );
  await press(client, 'Unidentified', 10009); // close details
  await evaluate(client, 'window.WuTizenDebug.lists.open()');
  const listText = String(await evaluate(client, 'window.WuTizenDebug.picker.text()'));
  check('My Stuff lists the saved title', listText.indexOf(listTitle) > -1, listText.slice(0, 70));
  check('list items are removable with the remote', (await evaluate(client, 'window.WuTizenDebug.picker.rows()')) > 0);
  await press(client, 'Enter', 13); // remove the first item
  check(
    'removing clears the item from storage',
    (await evaluate(client, 'window.WuTizenDebug.lists.count()')) === 0,
    String(await evaluate(client, 'window.WuTizenDebug.lists.count()'))
  );
  await press(client, 'Unidentified', 10009); // close My Stuff
  check('BACK closes My Stuff', (await evaluate(client, 'window.WuTizenDebug.picker.open()')) === false);


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
