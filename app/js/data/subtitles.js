/**
 * data/subtitles.js — subtitle discovery + parsing for the player overlay.
 *
 * Sources of subtitles, in the order Stremio defines them:
 *   1. `stream.subtitles` — subtitles shipped with the chosen stream (StreamBridge
 *      puts the Emby subtitle URLs here, which is why they were missing);
 *   2. every installed add-on advertising the `subtitles` resource.
 *
 * Only text is fetched (SRT or WebVTT) and parsed into cues; the player renders
 * them in a DOM overlay, so AVPlay (which cannot read network subtitle files) and
 * `<video>` behave the same. URLs are never logged or displayed.
 */

import { addonClient } from './addonClient.js';
import { advertises, streamCandidates } from './streamResolver.js';

var MAX_SUBTITLE_ADDONS = 6;

/** Parse SRT or WebVTT text into [{start, end, text}] (milliseconds). */
export function parseCues(text) {
  var source = String(text || '').replace(/\r\n?/g, '\n');
  var blocks = source.split(/\n{2,}/);
  var cues = [];
  var timeRe = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split('\n');
    for (var l = 0; l < lines.length; l++) {
      var match = timeRe.exec(lines[l]);
      if (!match) {
        continue;
      }
      var start =
        (parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10)) * 1000 +
        parseInt((match[4] + '00').slice(0, 3), 10);
      var end =
        (parseInt(match[5], 10) * 3600 + parseInt(match[6], 10) * 60 + parseInt(match[7], 10)) * 1000 +
        parseInt((match[8] + '00').slice(0, 3), 10);
      var body = lines
        .slice(l + 1)
        .join('\n')
        .replace(/<[^>]+>/g, '') // SRT/VTT inline tags
        .replace(/\{[^}]*\}/g, '') // ASS-style karaoke tags that leak into SRT
        .trim();
      if (body) {
        cues.push({ start: start, end: end, text: body });
      }
      break;
    }
  }
  cues.sort(function (a, b) {
    return a.start - b.start;
  });
  return cues;
}

/** Serialise cues as WebVTT (SRT → VTT conversion). */
export function toVtt(cues) {
  var list = cues || [];
  var out = ['WEBVTT', ''];
  for (var i = 0; i < list.length; i++) {
    out.push(String(i + 1));
    out.push(vttTime(list[i].start) + ' --> ' + vttTime(list[i].end));
    out.push(list[i].text);
    out.push('');
  }
  return out.join('\n');
}

function vttTime(ms) {
  var total = Math.max(0, ms || 0);
  var hours = Math.floor(total / 3600000);
  var minutes = Math.floor((total % 3600000) / 60000);
  var seconds = Math.floor((total % 60000) / 1000);
  var millis = total % 1000;
  return (
    (hours < 10 ? '0' : '') + hours + ':' +
    (minutes < 10 ? '0' : '') + minutes + ':' +
    (seconds < 10 ? '0' : '') + seconds + '.' +
    (millis < 100 ? '0' : '') + (millis < 10 ? '0' : '') + millis
  );
}

/** Fetch a subtitle file as text (CORS applies; failures are reported). */
export function fetchText(url, cb) {
  var xhr = new XMLHttpRequest();
  var done = false;
  function finish(err, text) {
    if (done) {
      return;
    }
    done = true;
    cb(err, text);
  }
  try {
    xhr.open('GET', url, true);
    xhr.timeout = 15000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(null, xhr.responseText);
      } else if (xhr.status === 0) {
        finish(new Error('blocked'));
      } else {
        finish(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.ontimeout = function () {
      finish(new Error('timeout'));
    };
    xhr.onerror = function () {
      finish(new Error('blocked'));
    };
    xhr.send();
  } catch (err) {
    finish(new Error('blocked'));
  }
}

/**
 * Collect subtitle candidates.
 * @param {{addons:object[], type:string, id:string, streamSubs:object[]}} options
 * @param {function} done ({items:[{url,label,lang,provider}], providers:[…]})
 */
export function candidateSubtitles(options, done) {
  var opts = options || {};
  var items = [];
  var seen = {};
  var providers = [];
  var streamSubs = opts.streamSubs || [];

  function add(url, lang, provider) {
    var value = String(url || '').trim();
    if (!value || seen[value]) {
      return false;
    }
    if (!/^https?:\/\//i.test(value)) {
      return false;
    }
    seen[value] = true;
    var code = String(lang || '').toLowerCase();
    items.push({
      url: value,
      lang: code,
      label: code ? code.toUpperCase() : 'SUB',
      provider: provider || 'stream'
    });
    return true;
  }

  for (var s = 0; s < streamSubs.length; s++) {
    add(streamSubs[s].url, streamSubs[s].lang, 'stream');
  }

  var list = opts.addons || [];
  var targets = [];
  for (var i = 0; i < list.length && targets.length < MAX_SUBTITLE_ADDONS; i++) {
    if (list[i] && list[i].url && advertises(list[i], 'subtitles')) {
      targets.push(list[i]);
    }
  }
  if (!targets.length) {
    done({ items: items, providers: providers });
    return;
  }

  var pending = targets.length;
  for (var t = 0; t < targets.length; t++) {
    (function (entry) {
      addonClient.subtitles(entry.url, opts.type || 'movie', opts.id, '', function (err, data) {
        var subs = !err && data && data.subtitles && data.subtitles.length ? data.subtitles : [];
        var added = 0;
        for (var k = 0; k < subs.length; k++) {
          if (add(subs[k].url, subs[k].lang, entry.name)) {
            added += 1;
          }
        }
        providers.push({
          name: String(entry.name || 'Add-on'),
          status: err ? 'error' : added ? 'ok' : 'empty',
          count: added
        });
        pending -= 1;
        if (pending === 0) {
          done({ items: items, providers: providers });
        }
      });
    })(targets[t]);
  }
}
