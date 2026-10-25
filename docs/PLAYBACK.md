# Playback (Milestone 5)

WuTizen plays **HTTP(S) streams returned by Stremio add-ons**. Two engines are
used, chosen at runtime; the active one is shown in the player HUD.

| Engine | Used when | Formats |
|---|---|---|
| **AVPlay** (`webapis.avplay`) | the shell exposes it *and* this document is the top-level document | MP4/MOV/TS, **HLS**, **DASH**, HEVC/H.265, AC3/EAC3 — whatever the panel decodes |
| **HTML5 `<video>`** | always available as fallback | progressive MP4 (H.264/AAC), **HLS** (Tizen 5.0 native), audio-only files; **not DASH** (needs MSE + dash.js, not shipped) |

Why AVPlay first: it is the TV's native pipeline, so HEVC, AC3 and DASH work
without extra JavaScript. Why HTML5 second: TizenBrew may run the module in a
sandboxed or iframe context where the native video plane cannot be composited
(AVPlay would show a black screen). In that case the app automatically uses
`<video>`; on a Tizen 5.0 panel that still covers H.264 MP4 and HLS.

## Stream discovery (where sources come from)

Every installed add-on that advertises the `stream` resource is asked — not only
the add-on whose catalog produced the item. That is what makes Emby Bridge /
TorBox work: they are stream-only add-ons with no catalogs of their own.

- candidates are filtered by `manifest.types` and the stream resource's
  `idPrefixes` (`tt…`), so an add-on is never asked for an id it cannot answer;
- ids keep literal colons (`tt0944947:1:2`) — percent-encoding them breaks
  providers that parse the path segment (`resourceUrl` in `data/addonClient.js`);
- answers are merged and de-duplicated by url / infoHash+fileIdx / externalUrl /
  ytId, then capped at 40; torrent entries are kept and refused at play time;
- the details screen shows loading, then "*N* sources · *k*/*m* add-ons
  answered", plus "name (host) · reason" for add-ons that returned nothing or
  failed (`auth`, `notFound`, `server`, `timeout`, `unreachable`). No URL, path
  or token is displayed or logged.

| Key | Action |
|---|---|
| OK | play / pause |
| ← / → | seek −10 s / +10 s |
| ↑ | **source picker** (switch stream while playing) |
| ↓ | **subtitle picker** |
| PLAY, PAUSE, PLAY/PAUSE | play, pause, toggle |
| FF / REW | seek ±30 s |
| BACK | close the picker, then the player (details stays open, focus returns) |
| UP / DOWN (before playback) | move between sources, pages and details rows |

## Sources & picker (v0.6.0)

- **Every** stream returned by **every** compatible installed add-on is listed —
  no 8-row cap, grouped by add-on name, with resolution, HDR, codec, size and
  language parsed from `name`/`title`/`description`/`behaviorHints.filename`.
- **Play** opens the picker when more than one source exists; a single source
  plays immediately. Every row is individually selectable with the remote.
- **↑ during playback** re-opens the picker and restarts on the chosen source
  (the selected subtitle is re-applied).
- Sources that cannot be played still appear, with the reason
  (`torrent`, `requiresHeaders`, `mixedContent`, `external`) instead of vanishing.

### StreamBridge (Emby → Stremio) notes

StreamBridge returns Emby **direct-play** URLs with the API key in the query and
marks them `behaviorHints.notWebReady`. Findings that matter here:

- `notWebReady` is **advisory** — these URLs play; only `proxyHeaders.request`
  (a required header set, which `<video>`/AVPlay cannot send) is refused.
- An `http://` Emby server on an `https://` page is **mixed content** and is
  blocked by Chromium (documented by StreamBridge itself). The player says so
  instead of reporting a network error; use the server's https address.
- `stream.subtitles[]` is honoured (see below).

## Fullscreen

Playback adds `html.is-player`: the rail, hero, rows and details are hidden and
only the player receives remote keys. The player fills the 1920×1080 stage
(scaled to the viewport in the browser preview), sits above every shell layer
(`z-index: 200`) and paints a black background. This is **in-app fullscreen** —
a webview module cannot request Tizen *system* fullscreen, so no such claim is
made. With AVPlay the app switches to the transparent `is-avplay` stage instead.

## Subtitles (v0.6.0)

- Candidates come from the **chosen stream's `subtitles[]`** *and* from every
  installed add-on advertising the `subtitles` resource, de-duplicated by URL.
- SRT and WebVTT are parsed into cues; `toVtt()` converts SRT to WebVTT for any
  path that needs a VTT document.
- Rendering is a **DOM overlay**, not `<track>`: AVPlay cannot read network
  subtitle files and `<track>` cannot be styled on M63 TV. That makes subtitles
  work identically on both engines, including above the AVPlay video plane.
- Picker: **Off**, one row per language (with the provider as meta), and — once a
  subtitle is selected — **size** (M/L/XL), **position** (bottom/middle/top) and
  **timing offset** (±0.5 s per press, applied live).
- Failures are explicit: a blocked/CORS or HTTP failure and an empty/unknown file
  are reported separately. Subtitle URLs are never displayed or logged.
- Limitations: no styled ASS/SSA (text is extracted where present), no bitmap
  subtitles (PGS/VobSub), no forced-track selection from Emby.

## Key map (pre-0.6.0 table, kept for reference)

| Key | Action |
|---|---|
|---|---|
| OK | play / pause |
| ← / → | seek −10 s / +10 s |
| PLAY, PAUSE, PLAY/PAUSE | play, pause, toggle |
| FF / REW | seek ±30 s |
| BACK | close the player (details stays open, focus returns to the stream row) |
| UP / DOWN | show the controls (they auto-hide after 5 s while playing) |

## What the player refuses (and says so)

| Stream shape | Message / reason code |
|---|---|
| `infoHash`, `btih`, `fileIdx`, `sources[]` (torrent) | `torrent` — no direct torrent playback; needs an add-on that resolves to HTTP (TorBox, Emby Bridge) |
| `magnet:` link | `torrent` |
| `externalUrl`, `ytId` | `external` |
| `behaviorHints.notWebReady === true` | `notWebReady` |
| non-HTTP scheme (`ipfs:`…) — filtered before playback | `scheme` |

## Error handling

| Situation | Reason code |
|---|---|
| connection lost / DNS / TLS | `network` |
| decoder rejects the codec (HEVC in `<video>`, DTS…) | `codec` |
| `MEDIA_ERR_SRC_NOT_SUPPORTED`, HTTP 403/404 on the media URL (expired signed link) | `expired` — the message asks the user to refresh the source list |
| nothing played within 25 s (12 s AVPlay prepare) | `timeout` |
| unknown container the engine cannot sniff | `unsupported` |

Redirects are followed by both engines, so short-lived links (TorBox/Emby Bridge
CDN URLs) work as long as they are valid when playback starts. The player never
retries a URL automatically: an expired signature needs a fresh stream request.

## Cleanup

Closing the player (BACK, or leaving the details screen) pauses the engine,
removes the media `src`, calls `AVPlay.stop()` + `close()`, restores the normal
opaque stage (the `is-avplay` transparent mode) and hands the remote back to the
row that started playback. Nothing keeps playing in the background.

## Device verification (Q60R / Tizen 5.0)

1. Open **Dodaci → Dijagnostika** — the header reports `avplay=yes|no`.
2. Play any source. The HUD shows **AVPlay** or **HTML5** in the top corner.
3. If it says HTML5 with a DASH/HDR source, the panel cannot decode it in the
   browser engine: prefer an H.264/MP4 source, or run the app as a TizenBrew
   top-level module so AVPlay is available.

## Not implemented (documented limitations)

- **Subtitles are not rendered** (subtitle add-ons can be installed and their
  manifests are stored, so the data is there for a later milestone).
- No resume/continue-watching position storage, no track/audio selection, no
  playback in the background.
- No torrent engine, by design.
- DASH requires AVPlay; there is no dash.js fallback.
