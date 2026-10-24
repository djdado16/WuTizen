# Environment inventory (verified 2026-10-24)

All values below were read from the machine, not assumed.

## Development machine

| Item | Value | Verdict |
|---|---|---|
| OS | Windows 11 Pro, build 26300 | OK |
| CPU | AMD Ryzen 7 7800X3D (8 cores) | OK for build; **no Intel HAXM** → Tizen TV emulator not practical |
| RAM | 31.6 GB | OK |
| Free disk (C:) | ~513 GB | OK (Tizen Studio + TV extensions ≈ 3–5 GB) |
| Hypervisor | present (Hyper-V/VBS) | irrelevant while we deploy to the real TV |
| Project path | `<project-root>` (local workspace, cloud-synced) | see security notes |
| Long path support | `LongPathsEnabled` not set | keep paths short; current depth is fine |
| VS Code | 1.143.1 + Cline | OK |

## Toolchain

| Tool | Version / state | Verdict |
|---|---|---|
| Node.js | v24.15.0 | OK |
| npm | 11.12.1 (registry reachable, `npm ping` PONG) | OK |
| npx | 11.12.1 | OK |
| Git | 2.54.0.windows.1 | OK — `user.name` / `user.email` are **not set** yet |
| Python | 3.10.9 | OK (optional: XML validation, `http.server`) |
| Java | Oracle JDK 21.0.5 (`java`, `javac`) | OK — Tizen Studio 6.1 ships its own `embedded-java` |
| Chrome | 149 (`C:\Program Files\Google\Chrome\Application\chrome.exe`) | OK — used for preview + smoke test |
| Edge | present | OK (smoke test falls back to it) |
| Samsung USB drivers | `C:\Program Files\Samsung\USB Drivers` | present, but deployment will use network `sdb` |
| **Tizen Studio** | **not installed** | ❌ blocks `.wgt` packaging/signing |
| **Tizen CLI (`tizen`)** | **not on PATH** | ❌ |
| **`sdb`** | **not installed** | ❌ |
| **Samsung certificates** | none (`~/.tizen-org`, `~/.cert` absent) | ❌ |

## Achieved in this environment

| Step | Result |
|---|---|
| `npm install` | 2 packages (esbuild + platform binary), ~2 s |
| `npm run build` | `dist/` = 55.1 kB total, JS bundle 34.4 kB |
| `npm run verify` | 8/8 checks pass |
| `npm run smoke` (headless Chrome 149) | 21/21 checks pass |
| Visual capture (1920×1080) | verified: home (HR), detail overlay, home (EN) |

## Missing prerequisites for deployment

1. **Tizen Studio 6.1 (web-cli)** — 295 MB installer (see `TIZEN_DEPLOYMENT.md`).
2. **TV Extensions-10.0** (Samsung TV SDK) — from Samsung's extension repository.
3. **Samsung Certificate Extension** — `tizen-certificate-extension_2.0.75.zip` (~44 MB).
4. **Samsung developer account** (free) — required to issue the TV **distributor**
   certificate; the distributor certificate must include the TV's **DUID**.
5. **TV in developer mode** with this PC's LAN IP allowed, TV DUID known
   (`Menu → Support → Contact Samsung → Unique Device ID`).
6. Git identity (`git config --global user.name / user.email`) before the first commit.
7. Reference screenshots for the visual fidelity pass.

## Security notes on this project path

The project lives on **OneDrive**, which means everything in it is uploaded to
Microsoft's cloud. Consequences enforced in this repo:

- **Signing certificates and keys must never be created here.** Use e.g.
  `C:\tizen-certs`. `.gitignore` also blocks `*.p12`, `*.pem`, `*.key`, `certs/`.
- **The original WuPlay export (`profile-data.json`) must stay outside the
  project.** `.gitignore` blocks it, and it is never requested by the app.
- Build output (`dist/`) and `node_modules/` churn OneDrive sync; both are
  gitignored and can be deleted at any time.
