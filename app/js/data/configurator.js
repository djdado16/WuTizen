/**
 * data/configurator.js — TV side of the PC/mobile configurator.
 *
 * Transport: the TV only makes **outbound** requests (a TizenBrew webview cannot
 * host a server), so the PC runs `tools/configurator/server.mjs` and the TV polls
 * it for a pairing session. Nothing leaves the LAN.
 *
 * Pairing: the PC shows a 6-digit code (8 min TTL, single use); the user types it
 * on the TV. The payload is handed over only after the PC user presses
 * "Approve & send", and only once. The code is kept in memory — never persisted,
 * logged or shown in diagnostics.
 */

import { getItem, setItem } from '../platform/storage.js';

var KEY = 'configurator';
var POLL_MS = 2000;
var MAX_MS = 8 * 60 * 1000;

var timer = null;
var status = 'idle';
var pending = null;
var listeners = null;

export function normalizeHost(input) {
  var url = String(input || '').trim();
  if (!url) {
    return '';
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '');
}

/** Last used PC address (no code, no credentials). */
export function savedHost() {
  var data = getItem(KEY, null);
  return data && data.host ? String(data.host) : '';
}

export function rememberHost(host) {
  setItem(KEY, { host: normalizeHost(host) });
}

export function state() {
  return { status: status, hasPayload: !!pending };
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  status = 'idle';
}

function emit(next, detail) {
  status = next;
  if (listeners && listeners.onStatus) {
    listeners.onStatus(next, detail || '');
  }
}

/**
 * Begin polling the PC for an approved payload.
 * @param {{host:string, code:string}} options
 * @param {{onStatus:function, onPayload:function}} handlers
 */
export function start(options, handlers) {
  var host = normalizeHost(options && options.host);
  var code = String((options && options.code) || '').replace(/\D/g, '');
  listeners = handlers || null;
  pending = null;
  stop();
  if (!host || code.length !== 6) {
    emit('invalid');
    return false;
  }
  if (host.indexOf('https://') !== 0 && String(window.location.protocol) === 'https:') {
    // Chromium blocks http requests from an https page (mixed content).
    emit('mixedContent');
    return false;
  }
  rememberHost(host);
  emit('waiting');
  var started = Date.now();
  timer = setInterval(function () {
    if (Date.now() - started > MAX_MS) {
      stop();
      emit('expired');
      return;
    }
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', host + '/api/session/' + code + '/claim', true);
      xhr.timeout = 8000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) {
          return;
        }
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          data = null;
        }
        if (xhr.status === 200 && data && data.state === 'ready') {
          stop();
          pending = data.payload || {};
          emit('ready');
          if (listeners && listeners.onPayload) {
            listeners.onPayload(pending);
          }
          return;
        }
        if (xhr.status === 404 || xhr.status === 409) {
          stop();
          emit(xhr.status === 409 ? 'delivered' : 'expired');
        }
      };
      xhr.onerror = function () {
        emit('unreachable');
      };
      xhr.send();
    } catch (err2) {
      stop();
      emit('unreachable');
    }
  }, POLL_MS);
  return true;
}

/** The payload received from the PC (already approved there). */
export function payload() {
  return pending;
}

export function clearPayload() {
  pending = null;
}
