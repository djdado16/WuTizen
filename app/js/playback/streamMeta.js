/**
 * playback/streamMeta.js — parse the human-readable facts out of a Stremio
 * stream so the picker can show resolution / HDR / codec / language / size.
 *
 * Stremio has no structured fields for this: add-ons put the information in any
 * combination of `name`, `title`, `description` and `behaviorHints.filename`, and
 * StreamBridge-style providers use `title` for the technical summary. So this is
 * deliberately a set of tolerant regexes over all of them.
 */

function haystack(stream) {
  var hints = (stream && stream.behaviorHints) || {};
  return [
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    hints.filename,
    hints.videoSize ? hints.videoSize + 'b' : ''
  ]
    .filter(Boolean)
    .join(' ');
}

export function metaOf(stream) {
  var text = haystack(stream || {});
  var resolution = '';
  var resMatch = /(2160p|\b4k\b|\buhd\b|1440p|1080p|720p|576p|480p|360p)/i.exec(text);
  if (resMatch) {
    var value = resMatch[1].toUpperCase();
    resolution = value === '4K' || value === 'UHD' ? '2160P' : value;
  }
  var hdr = '';
  if (/\b(dolby\s*vision|dovi)\b/i.test(text)) {
    hdr = 'DV';
  } else if (/\bhdr10\+/i.test(text)) {
    hdr = 'HDR10+';
  } else if (/\bhdr10\b/i.test(text)) {
    hdr = 'HDR10';
  } else if (/\bhdr\b/i.test(text)) {
    hdr = 'HDR';
  }
  var codec = '';
  var codecMatch = /\b(h\.?265|hevc|x265|h\.?264|avc|x264|av1|vp9)\b/i.exec(text);
  if (codecMatch) {
    codec = codecMatch[1].toUpperCase().replace('H.265', 'HEVC').replace('H.264', 'AVC');
  }
  var languages = [];
  var langRe = /\b(hr|sr|bs|sl|en|de|fr|es|it|pl|ru|tr|pt|nl|cz|cs|hu|ro|el)\b/gi;
  var langMatch = langRe.exec(text);
  while (langMatch) {
    var code = langMatch[1].toUpperCase();
    if (languages.indexOf(code) === -1) {
      languages.push(code);
    }
    langMatch = langRe.exec(text);
  }
  var size = '';
  var sizeMatch = /(\d+(?:[.,]\d+)?)\s*(gb|mb|gib|mib)\b/i.exec(text);
  if (sizeMatch) {
    size = sizeMatch[1].replace(',', '.') + ' ' + sizeMatch[2].toUpperCase();
  }
  var source = '';
  if (/\bblu[\s-]?ray\b/i.test(text)) {
    source = 'BluRay';
  } else if (/\bweb[\s-]?dl\b/i.test(text)) {
    source = 'WEB-DL';
  } else if (/\bwebrip\b/i.test(text)) {
    source = 'WEBRip';
  } else if (/\bhdtv\b/i.test(text)) {
    source = 'HDTV';
  }
  return {
    resolution: resolution,
    hdr: hdr,
    codec: codec,
    languages: languages,
    size: size,
    source: source,
    label: [resolution, hdr, codec, size].filter(Boolean).join(' · ')
  };
}
