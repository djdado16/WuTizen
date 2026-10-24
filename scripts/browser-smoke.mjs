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

const APP_PORT = 8123;
const CDP_PORT = 9223;
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
  await sleep(90); // let the 120-200ms CSS transitions settle
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

  for (let i = 0; i < 3; i++) {
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

  await press(client, 'ArrowRight', 39);
  for (let i = 0; i < 6; i++) {
    await press(client, 'ArrowRight', 39);
  }
  const transforms = await evaluate(
    client,
    'Array.prototype.map.call(document.querySelectorAll(".row__track"), function (t) { return t.style.transform || "none"; })'
  );
  check('row pages horizontally', transforms.some((v) => /translate3d\(-\d/.test(v)), transforms.join(' | '));

  const lazy = await evaluate(client, 'window.WuTizenDebug.snapshot().images');
  check('lazy loader bounds live images', lazy.attached > 0 && lazy.live <= 18, JSON.stringify(lazy));

  await sleep(200);
  check('no uncaught exceptions', client.exceptions.length === 0, client.exceptions.join('; ').slice(0, 240));
  check('no console errors', client.consoleErrors.length === 0, client.consoleErrors.join('; ').slice(0, 240));

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
