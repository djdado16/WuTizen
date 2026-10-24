# Tizen deployment — verified instructions (nothing installed yet)

Status: **not installed**. This document collects the verified, current facts so
installation can be approved and executed in one step.

## 1. Verified download sources

Checked live on `download.tizen.org` (public, free, no account needed):

| Artefact | Path / file | Size |
|---|---|---|
| Tizen Studio 6.1 — **web CLI only** (recommended) | `https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_windows-64.exe` | ~282 MB |
| Tizen Studio 6.1 — Web IDE | `…/tizen-studio_6.1/web-ide_Tizen_Studio_6.1_windows-64.exe` | ~630 MB |
| Tizen Studio 6.1 — Baseline (full) | `…/tizen-studio_6.1/Baseline_Tizen_Studio_6.1_windows-64.exe` | ~1.55 GB |
| Samsung TV extension repository | `https://download.tizen.org/sdk/extensions/tv_extensions/` | package list shows **TV Extensions-10.0** (`TV-SAMSUNG-Public`, v10.0.0) |
| Samsung Certificate Extension | `https://download.tizen.org/sdk/extensions/tizen-certificate-extension_2.0.75.zip` | ~42 MB |

`web-cli` contains the `tizen` CLI, `sdb`, and the package manager CLI. The
`embedded-java` dependency means the system JDK 21 will not conflict.

Samsung documentation used:

- Installing the TV SDK — <https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html>
- Creating certificates — <https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html>
- TV Simulator (PC-side) — <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-simulator.html>
- Web engine table — <https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html>

## 2. Installation procedure (to run after approval)

1. **Install Tizen Studio (web-cli)** → e.g. `C:\tizen-studio`.
2. **PATH**: add `C:\tizen-studio\tools\ide\bin` (for `tizen`) and
   `C:\tizen-studio\tools` (for `sdb`). Verify with `tizen version` and `sdb version`.
3. **Add the Samsung extension repository** in Package Manager and install
   **TV Extensions-10.0** + **Samsung Certificate Extension**.
   CLI route: `package-manager-cli.bat install <package>` from
   `C:\tizen-studio\package-manager\`, using the repository above.
4. **Certificates** — Certificate Manager → *Samsung* certificate:
   - **Author certificate**: name, password, your Samsung account.
   - **Distributor certificate**: privilege level + **the TV's DUID**.
   - DUID is shown on the TV: `Menu → Support → Contact Samsung → Unique Device ID`.
   - Store the `.p12` files in **`C:\tizen-certs`** — **never** in OneDrive.
   - Then: `tizen security-profiles add -n wuplay-tv -a <author.p12> -p <password>`
     (exact distributor flags to be confirmed from `--help` on the installed
     version — they differ between Tizen Studio releases).
5. **TV developer mode**: on the TV open *Apps*, type **12345**, enable
   *Developer mode*, enter this PC's LAN IP, then power-cycle the TV.

## 3. Build / package / deploy loop

```powershell
npm run build                                                # -> dist/
tizen build-web -- dist                                      # -> dist/.buildResult
tizen package -t wgt -s wuplay-tv -- dist/.buildResult       # -> WuTizen.WuTizen.wgt
sdb connect <TV_IP>:26101
sdb devices
tizen install-permit -t <TARGET>                             # accept prompt on TV
tizen install -n WuTizen.WuTizen.wgt -t <TARGET>
tizen run -p WuTizen.WuTizen -t <TARGET>
```

Debugging: **Web Inspector / WITS** (`tizen debug`), or `sdb shell dlogutil` for logs.

`scripts/tizen-package.ps1` and `scripts/tizen-deploy.ps1` wrap the above; both
abort with instructions if `tizen` / `sdb` are missing.

## 4. Risks specific to this project

| Risk | Mitigation |
|---|---|
| Current TV SDK is **10.0** while the target is **Tizen 5.0** | `config.xml` declares `required_version="5.0"`; the bundled JS/CSS is M63-safe by construction. **Must be validated by installing on the Q60R** (Milestone 1). |
| Newer TV extension may refuse to select a 5.0 target in the IDE wizard | We do not use the wizard: the manifest is authored by hand in `app/config.xml`. |
| If install is rejected on the TV | Fall back to the archived TV SDK 8.0.1 extension, or lower `required_version` further — decided from the actual error. |
| Java 21 vs older signing tooling | Tizen Studio 6.1 ships `embedded-java`; if Certificate Manager misbehaves, install Temurin **17** alongside (free). |
| **TV emulator unusable here** | Emulator images are x86 + Intel HAXM; this machine is AMD with Hyper-V active. Use the real TV (or the PC-side TV Simulator) instead. |
| Certificate in OneDrive | Forbidden by project rules; use `C:\tizen-certs`. |

## 5. What cannot be claimed yet

- That the app **installs and runs on the Q60R** — untested until Milestone 1.
- That `required_version="5.0"` is accepted by this TV's firmware.
- Real-device frame rate, memory headroom, and AVPlay behaviour.
