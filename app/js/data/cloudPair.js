/**
 * data/cloudPair.js — TV side of the Cloudflare pairing (iteration 2).
 *
 * Crypto: the TV generates an ephemeral **ECDH P-256** key pair (WebCrypto, also
 * in Chromium 63), publishes only its public key, and derives an AES-GCM-256 key
 * from the browser's public key. The 6-digit code authorises joining a session; it
 * is never key material, so a KV dump cannot be brute-forced offline.
 *
 * Approval: publishing the TV public key is the explicit approval (it only happens
 * after the user enters the code and presses Connect); the payload is applied only
 * after a second, explicit Apply on the TV.
 */

var POLL_MS = 2500;
var MAX_MS = 9 * 60 * 1000;

var timer = null;
var status = 'idle';
var pending = null;
var keyPair = null;
var listeners = null;
var sasValue = null;
var sasChecked = false;
var ctxBase = '';
var ctxCode = '';
var myPubB64 = null;

/** Permanent, deployed Cloudflare configurator. Typed on the phone, never on the TV. */
var DEFAULT_BASE = 'https://wutizen-config.pages.dev';

export function defaultBase() {
  return DEFAULT_BASE;
}

export function normalizeBase(input) {
  var url = String(input || '').trim();
  if (!url) {
    return '';
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url.replace(/\/+$/, '');
}

export function state() {
  return {
    status: status,
    sas: sasValue,
    hasPayload: !!pending,
    crypto: !!(typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
  };
}

export function payload() {
  return pending;
}

export function clearPayload() {
  pending = null;
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  status = 'idle';
}

function emit(next) {
  status = next;
  if (listeners && listeners.onStatus) {
    listeners.onStatus(next);
  }
}

function request(method, url, body, cb) {
  var xhr = new XMLHttpRequest();
  var done = false;
  function finish(err, data) {
    if (done) {
      return;
    }
    done = true;
    cb(err, data);
  }
  try {
    xhr.open(method, url, true);
    xhr.timeout = 8000;
    if (body) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
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
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(null, data);
      } else if (xhr.status === 0) {
        finish(new Error('unreachable'));
      } else {
        finish(new Error(String((data && (data.state || data.error)) || 'http ' + xhr.status)));
      }
    };
    xhr.ontimeout = function () {
      finish(new Error('unreachable'));
    };
    xhr.onerror = function () {
      finish(new Error('unreachable'));
    };
    xhr.send(body ? JSON.stringify(body) : undefined);
  } catch (err2) {
    finish(new Error('unreachable'));
  }
}

function b64(buffer) {
  var bytes = new Uint8Array(buffer);
  var text = '';
  for (var i = 0; i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  return btoa(text);
}

function unb64(value) {
  var text = atob(String(value || ''));
  var bytes = new Uint8Array(text.length);
  for (var i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}

/**
 * Join a cloud pairing session and wait for the encrypted payload.
 * @param {{base:string, code:string}} options
 * @param {{onStatus:function, onPayload:function}} handlers
 */
export function start(options, handlers) {
  var base = normalizeBase(options && options.base);
  var code = String((options && options.code) || '').replace(/\D/g, '');
  listeners = handlers || null;
  pending = null;
  sasValue = null;
  sasChecked = false;
  myPubB64 = null;
  ctxBase = base;
  ctxCode = code;
  stop();
  if (!base || code.length !== 6) {
    emit('invalid');
    return false;
  }
  if (!window.crypto || !window.crypto.subtle) {
    // Chromium 63 has WebCrypto, but only in a secure context (https or file).
    emit('noCrypto');
    return false;
  }
  if (String(window.location.protocol) === 'https:' && base.indexOf('https://') !== 0) {
    emit('mixedContent');
    return false;
  }
  emit('pairing');
  window.crypto.subtle
    .generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits'])
    .then(function (pair) {
      keyPair = pair;
      return window.crypto.subtle.exportKey('spki', pair.publicKey);
    })
    .then(function (spki) {
      myPubB64 = b64(spki);
      // KV writes may take a moment to become readable from another isolate, so the
      // registration is retried instead of failing the whole pairing.
      return new Promise(function (resolve, reject) {
        var attempts = 0;
        function attempt() {
          attempts += 1;
          request('POST', base + '/api/session/' + code + '/device', { pub: myPubB64 }, function (err, data) {
            if (!err) {
              resolve(data);
              return;
            }
            if (attempts < 5 && err.message === 'expired') {
              setTimeout(attempt, 900);
              return;
            }
            reject(err);
          });
        }
        attempt();
      });
    })
    .then(function () {
      emit('waiting');
      poll(base, code, Date.now(), listeners);
    })
    .catch(function (err) {
      stop();
      emit(err && err.message === 'unreachable' ? 'unreachable' : 'rejected');
    });
  return true;
}

function poll(base, code, started, handles) {
  timer = setInterval(function () {
    if (Date.now() - started > MAX_MS) {
      stop();
      emit('expired');
      return;
    }
    request('GET', base + '/api/session/' + code, null, function (err, data) {
      if (err) {
        // A freshly created session may not be readable yet; keep polling briefly.
        if (err.message === 'expired' && Date.now() - started < 90000) {
          return;
        }
        emit('unreachable');
        return;
      }
      if (!data) {
        return;
      }
      if (data.state === 'confirm' && data.pub && !sasChecked) {
        sasChecked = true;
        verifySas(data, handles);
        return;
      }
      if (data.state !== 'ready' || !data.payload) {
        return;
      }
      stop();
      decrypt(data.payload, handles);
    });
  }, POLL_MS);
}

function decrypt(envelope, handles) {
  window.crypto.subtle
    .importKey('spki', unb64(envelope.pub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    .then(function (browserPub) {
      return window.crypto.subtle.deriveKey(
        { name: 'ECDH', public: browserPub },
        keyPair.privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    })
    .then(function (key) {
      return window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(envelope.iv) },
        key,
        unb64(envelope.data)
      );
    })
    .then(function (plain) {
      pending = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(plain)));
      keyPair = null;
      emit('ready');
      if (handles && handles.onPayload) {
        handles.onPayload(pending);
      }
    })
    .catch(function () {
      keyPair = null;
      emit('decryptFailed');
    });
}



function shortAuthString(shared, tvPub, pcPub) {
  var bits = new Uint8Array(shared);
  var t = unb64(tvPub);
  var p = unb64(pcPub);
  var all = new Uint8Array(bits.length + t.length + p.length);
  all.set(bits, 0);
  all.set(t, bits.length);
  all.set(p, bits.length + t.length);
  return window.crypto.subtle.digest('SHA-256', all).then(function (digest) {
    var view = new DataView(digest);
    return String(100000 + (view.getUint32(0) % 900000));
  });
}

/**
 * Derive the short authentication string from the shared secret and the pairing
 * transcript (both public keys). It is shown on the TV and on the browser page; the
 * user confirms they match before the payload can be transferred. A mismatch
 * destroys the session on the relay, so nothing is delivered or applied.
 */
function verifySas(data, handles) {
  if (!keyPair) {
    emit('decryptFailed');
    return;
  }
  window.crypto.subtle
    .importKey('spki', unb64(data.pub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    .then(function (pcPub) {
      return window.crypto.subtle.deriveBits({ name: 'ECDH', public: pcPub }, keyPair.privateKey, 256);
    })
    .then(function (bits) {
      return shortAuthString(bits, myPubB64, data.pub);
    })
    .then(function (mine) {
      sasValue = mine;
      if (String(data.sas) !== mine) {
        stop();
        emit('sasMismatch');
        request('POST', ctxBase + '/api/session/' + ctxCode + '/confirm', { ok: false }, function () {});
        return;
      }
      emit('confirm');
      if (handles && handles.onSas) {
        handles.onSas(mine);
      }
    })
    .catch(function () {
      emit('decryptFailed');
    });
}

/** Explicit user confirmation that the two SAS values match (TV side). */
export function confirmSas() {
  if (!ctxBase || !ctxCode || sasValue === null) {
    return false;
  }
  request('POST', ctxBase + '/api/session/' + ctxCode + '/confirm', { ok: true }, function (err) {
    if (err) {
      emit('rejected');
      return;
    }
    emit('confirmed');
    if (listeners && listeners.onStatus) {
      listeners.onStatus('confirmed');
    }
  });
  return true;
}

export function sas() {
  return sasValue;
}
