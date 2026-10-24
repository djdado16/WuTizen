# WuTizen — Samsung Tizen TV client

A native-feeling Samsung TV web application inspired by **WuPlay for Android TV**.
**App name:** WuTizen · **Developer:** djdado16

Target device: **Samsung QE65Q60RATXXH** (2019) — **Tizen 5.0 / Chromium M63**, 3840×2160 panel rendered as a **1920×1080** CSS stage.

Ships two ways from the same `dist/` output:
a **TizenBrew module** (loaded from GitHub, no Tizen Studio needed —
see [docs/TIZENBREW.md](docs/TIZENBREW.md)) and a **standalone `.wgt`**
(see [docs/TIZEN_DEPLOYMENT.md](docs/TIZEN_DEPLOYMENT.md)).

> **Status: Milestone 0 complete** — application shell, D-pad focus system, placeholder
> catalogue rows, detail overlay, HR/EN localization, Tizen platform abstraction.
> No streaming, no playback, no profile import, no network access yet.

---

## 1. Requirements

| Tool | Version used | Needed for |
|---|---|---|
| Node.js | 24.15.0 (≥18 supported) | build, verification, smoke test |
| npm | 11.x | one dev dependency (`esbuild`) |
| Chrome or Edge | any recent | browser preview + automated smoke test |
| Tizen Studio (CLI) | *not installed yet* | `.wgt` packaging, signing, TV deployment |
| Python 3 | 3.10 (optional) | extra `config.xml` XML validation, `http.server` |

Runtime dependencies: **none**. The application ships vanilla JS + CSS only.

---

## 2. Commands

```powershell
npm install          # installs esbuild (dev only)
npm run icon         # regenerate app/assets/icon.png (procedural PNG, no assets copied)
npm run build        # app/ -> dist/  (IIFE bundle, target chrome63)
npm run build:prod   # same, minified
npm run watch        # rebuild on change
npm run serve        # static server for dist/ on http://localhost:8080
npm run dev          # build + serve
npm run verify       # static compatibility/consistency gate (8 checks)
npm run smoke        # headless Chrome end-to-end keyboard test (21 checks)
npm run smoke -- --shots .\shots   # same + PNG captures of key states
npm run module       # validate the TizenBrew module manifest + print the install string
```

`dist/` is the exact payload that gets packed into the `.wgt`. `scripts/build.mjs`
wipes only `dist/` (build output); it never touches source or user data.

## 3. Browser preview

```powershell
npm run build
npm run serve
```

Open <http://localhost:8080>. For a 1:1 pixel preview use Chrome DevTools device
toolbar at **1920×1080**; at any other window size `main.js` scales the fixed
1920×1080 stage to fit (Tizen itself never scales it).

Keyboard mapping for the preview: arrows = remote D-pad, `Enter` = OK,
`Esc`/`Backspace` = BACK, `MediaPlayPause` etc. are reported as "not part of
Milestone 0".

## 4. Project layout

```
app/            source of the application (this is what ships)
  index.html    single entry, 1920x1080 stage, one classic <script>
  config.xml    Tizen manifest (tv-samsung, required_version 5.0)
  css/          reset, tokens (design variables), layout, components
  js/core/      keys, focus manager, router, log  (framework-free core)
  js/i18n/      hr (default) + en dictionaries and lookup
  js/platform/  Tizen abstraction (guarded), storage wrapper
  js/data/      placeholder catalogue (replaced by add-on client in M2)
  js/ui/        rail, shelf, card, toast, detail overlay
  assets/       procedural placeholder icon only
scripts/        build, serve, verify, smoke, icon generator, Tizen PS1 helpers
docs/           research + decisions + compatibility notes
dist/           build output (gitignored)
```

## 5. Tizen packaging

Not installed and not executed yet — see **docs/TIZEN_DEPLOYMENT.md** for the
verified installation and deployment procedure. `scripts/tizen-package.ps1` and
`scripts/tizen-deploy.ps1` are prepared but untested against a real Tizen SDK
installation (they refuse to run when `tizen` is not on `PATH`).

## 6. Security rules enforced in this repo

- No credentials, tokens, signing certificates or WuPlay profile exports in the
  repository; `.gitignore` blocks `*.p12`, `profile-data.json`, `certs/`, `.env`.
- Certificates must also stay **outside OneDrive** (they would otherwise be
  uploaded to cloud storage). Use e.g. `C:\tizen-certs`.
- No hardcoded add-on URLs; add-ons will be user-entered at runtime.
- Nothing is sent to any WuPlay service by this app.

## 7. Documentation

| File | Content |
|---|---|
| `docs/TIZENBREW.md` | **publish to GitHub + load through TizenBrew (module format, install string)** |
| `docs/ENVIRONMENT.md` | verified dev-environment inventory + missing prerequisites |
| `docs/COMPATIBILITY.md` | Tizen 5.0 / Chromium M63 constraints and measured results |
| `docs/WUPLAY_API_RESEARCH.md` | WuPlay API research: findings, sources, conclusion |
| `docs/TIZEN_DEPLOYMENT.md` | verified install/sign/deploy procedure (pending approval) |
| `docs/DESIGN_TARGETS.md` | what is placeholder and what the screenshots must define |
| `docs/DECISIONS.md` | architecture decision record |
