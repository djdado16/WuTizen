# WuTizen on TizenBrew

WuTizen is distributed as a **TizenBrew application module** (`packageType: "app"`):
a plain web page hosted in a public GitHub repository and served to the TV through
jsDelivr. No Tizen Studio, no certificate and no `.wgt` is needed to run it this way.

The standalone Tizen build (`tizen build-web` → `tizen package` → `sdb install`)
still works unchanged — see `TIZEN_DEPLOYMENT.md`.

---

## 1. Module format (verified against the official sources)

TizenBrew documents three module types — applications, site modifications and
services — and reads a module's `package.json` to decide how to run it:

| Field | Value in WuTizen | Meaning |
|---|---|---|
| `packageType` | `"app"` | plain web page, no injected scripts |
| `appName` | `"WuTizen"` | friendly name shown in TizenBrew |
| `appPath` | `"dist/index.html"` | path to the entry page **inside the repo** |
| `keys` | media keys | remote keys registered via `TVInputDevice` |
| `serviceFile` | *omitted* | optional NodeJS service — not needed |
| `name` / `version` | `wutizen` / `0.2.0` | required for jsDelivr resolution |

Validation: `npm run module` (checks these fields, that `appPath` exists, the
payload size, and scans the payload for credentials).

How TizenBrew resolves a module (verified in its source):

1. Modules are addressed as `<type>/<name>` where type is `gh` or `npm`.
2. It fetches `https://cdn.jsdelivr.net/<type>/<name>/package.json`.
3. For `packageType: "app"` it serves the app locally from
   `http://127.0.0.1:8081/module/<url-encoded module>/<appPath>`, proxying each
   file from the same jsDelivr prefix.

Sources:
[`docs/MODULES.md`](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md) ·
[`service/utils/moduleLoader.js`](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/service-nextgen/service/utils/moduleLoader.js) ·
[`service/index.js`](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/service-nextgen/service/index.js) ·
[TizenBrew install guide](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md)

Because the app is proxied file-by-file, **`dist/` must be committed** to the
repository (this project intentionally does not gitignore it).

---

## 2. Publish the module to GitHub

Prerequisite: a **public** GitHub repository (jsDelivr cannot read private repos).

```powershell
cd "<path to your WuTizen checkout>"

npm run build          # regenerate dist/
npm run module         # validate the module manifest + payload

git init -b main
git add .
git commit -m "WuTizen 0.2.0"
git remote add origin https://github.com/djdado16/WuTizen.git
git push -u origin main
```

Optional but recommended (pinned, cache-proof installs):

```powershell
git tag v0.2.0
git push origin v0.2.0
```

> The commands above assume the repository is named **WuTizen** under the
> **djdado16** account, which is what `package.json` → `repository` declares.
> If you name it differently, change that field and this document; the install
> string is always `gh/<user>/<repo>`.

**Never commit**: certificates (`*.p12`), `profile-data.json`, `.env`, add-on URLs
with embedded keys. `.gitignore` already blocks them — keep it that way.

---

## 3. Load it through TizenBrew on the TV

TizenBrew must already be installed (it needs Tizen ≥ 3.0; the Q60R runs 5.0 —
see the [TizenBrew install guide](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md)).

1. Open **TizenBrew** on the TV.
2. Go to **Modules**.
3. Choose **Add GitHub Module** (`moduleManager.addGH`).
4. Enter the repository in the form `user/repo`:

   ```
   djdado16/WuTizen
   ```

5. WuTizen appears in the module list — select it to launch.

TizenBrew stores the entry internally as `gh/djdado16/WuTizen` and loads:

```
manifest : https://cdn.jsdelivr.net/gh/djdado16/WuTizen/package.json
entry    : https://cdn.jsdelivr.net/gh/djdado16/WuTizen/dist/index.html
```

To pin a release instead of tracking the default branch (recommended once tagged):

```
djdado16/WuTizen@v0.2.0
```

---

## 4. Updating a deployed module

1. `npm run build` and commit the changed `dist/` files, then push (and tag if you
   pinned a version).
2. jsDelivr caches default-branch files for about 12 hours. To refresh
   immediately, open the purge URL once in a browser:

   ```
   https://purge.jsdelivr.net/gh/djdado16/WuTizen@main/dist/index.html
   https://purge.jsdelivr.net/gh/djdado16/WuTizen@main/package.json
   ```

3. Re-launch the module from TizenBrew (pinned `@version` installs need the tag
   and the new module string).

---

## 5. Differences from the standalone build

| | TizenBrew module | Standalone `.wgt` |
|---|---|---|
| Install | none (served from GitHub via jsDelivr) | `tizen install` + Samsung certificate |
| TV app icon | no — launched from TizenBrew | yes |
| Needs internet | yes (files are fetched) | only for app features |
| Privileges | whatever TizenBrew holds | declared in `app/config.xml` |
| Updates | push to GitHub | rebuild + reinstall |
| `config.xml` | not used | used |

Both consume the **same** `dist/` output, so the UI, focus handling and
localization are identical.

---

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| Module listed as **Unknown Module** | repo not public, `package.json` not at repo root, or the `user/repo` string is wrong |
| Blank/black page | `appPath` does not exist in the repo (forgot to commit `dist/`), or a stale jsDelivr cache |
| Old version keeps loading | jsDelivr caching — purge the URLs above or install a pinned tag |
| Remote keys ignored | `keys` missing from `package.json`; the app also registers them itself via `platform/tizen.js` |
| Works in browser, not in TizenBrew | run `npm run verify` — the bundle must stay M63-safe (IIFE, no ES modules) |
