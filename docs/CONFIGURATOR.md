# PC/Mobile configurator (v0.7.1)

Configure the TV from a PC or phone instead of typing URLs, usernames and
passwords with the Samsung remote.

## Why this architecture

A TizenBrew module runs inside a TV webview: it has **no sockets**, so the TV can
never host an HTTP server, and it cannot be discovered from the LAN. What the TV
*can* do is make outbound HTTP requests (the same direction the add-ons and the
LAN profile import already use).

So the **PC hosts a tiny local server** and the TV **polls** it:

```
  PC (node tools/configurator/server.mjs)          Samsung TV (WuTizen)
  ┌────────────────────────────────────┐          ┌───────────────────────────┐
  │ browser UI  http://<pc>:8765/      │          │ Settings → Konfigurator   │
  │  • code shown (6 digits, 8 min)    │◄─────────│  • enters host + code     │
  │  • "Approve & send" (explicit)     │  GET     │  • polls every 2 s        │
  │ in-memory session, single use      │  claim   │  • applies after approval │
  └────────────────────────────────────┘          └───────────────────────────┘
```

No cloud storage, no relay, no paid service, no third-party account.

## Usage

1. On the PC: `node tools/configurator/server.mjs --lan` (Node 18+; no `npm install`).
   It prints `http://<pc-ip>:8765/`.
2. Open that address in a browser, fill in what you want to change, press
   **Start pairing** → a 6-digit code appears.
3. On the TV: **Postavke → Konfigurator s računala**, enter the PC address and the
   code, press **Poveži se**. The status shows “waiting for approval”.
4. Back on the PC press **Approve & send**. The TV receives the payload within a
   few seconds and shows “Postavke su primljene. Pritisnite Primijeni.”
5. On the TV press **Primijeni** — add-ons are added (never replaced), Emby
   credentials are validated by signing in, preferences are saved to
   `wuplay.prefs`.
6. Stop the PC server (Ctrl+C). Settings persist across restarts.

## What can be transferred

| Section | Applied as |
|---|---|
| Emby URL / user / password | validated with `Users/AuthenticateByName`, token stored in `wuplay.emby` |
| Stremio add-on URLs (one per line) | installed through the normal manifest validation; existing ones are skipped, never removed |
| WuPlay profile export (JSON) | the existing tolerant importer (hosts-only summary) |
| Preferences | `wuplay.prefs` (language, subtitle size) |

## Security model and limitations

- **Pairing code**: 6 digits, generated on the PC, valid 8 minutes, **single use**,
  kept in memory on both sides (never written to storage, never logged). A session
  that was never approved returns `{"state":"waiting"}` with no payload; a
  delivered session is deleted and cannot be replayed.
- **Explicit approval**: the payload is sent only when the person at the PC presses
  “Approve & send” — the TV alone cannot pull settings.
- **LAN only**: the server binds to the LAN interface; it is meant to run for a few
  minutes and then be stopped.
- **Plain HTTP on the LAN**: the transfer is not encrypted. Treat the network as
  trusted, or use an SSH tunnel if it is not. Credentials are stored on the TV in
  `localStorage`, which is **not encrypted** (documented limitation).
- `https` configurator + `http`… : a page loaded over `https` cannot call an `http`
  server (mixed content) — the TV reports this instead of failing silently.
- The server logs only that a session was created / approved / delivered. It never
  logs payloads, credentials or URLs.
- Anyone on the LAN can *create* a session, but they cannot approve it for you, and
  a code is useless once used or expired.
