# CLAUDE.md

Notes for working in this repo. The repo docs (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `MANIFESTO.md`, `REMOVED.md`) are authoritative for the upstream project; this file covers only what is specific to this fork.

## Identity of this repo

This is a fork of `uBlock-mv3` (somebody's MV3 port of uBlock Origin), which is itself a fork of upstream `uBlock` (gorhill/uBlock, MV2-only).

The fork's purpose: keep the main extension (`platform/chromium/`) running on Chromium under Manifest V3 by polyfilling MV2 APIs with `chrome.scripting` / `chrome.userScripts` / offscreen documents, instead of using upstream's separate "uBlock Origin Lite" codebase under `platform/mv3/`. The result still depends on Chromium's force-install policy or `--allowlisted-extension-id` because `webRequestBlocking` is only available to allowlisted MV3 extensions.

## Remotes (expected setup)

| Remote | What | Used for |
| --- | --- | --- |
| `origin` | This fork (ZigZagT/uBlock-mv3) | Push target |
| `upstream` | `gorhill/uBlock` (MV2 mainline) | Source of truth for the main extension code |
| `upstream-mv3` | `r58Playz/uBlock-mv3` (MV3 fork) | Reference for MV3 polyfill decisions |

## Two MV3 codebases in this tree (do not confuse)

- `platform/chromium/` — **this fork's MV3 port of the main extension.** Touch this for MV3 work. Entry: `background.sw.js` (service worker module), polyfills in `patches.js`, `webext.js`, `worker.mv3.js`, `xhr.mv3.js`, offscreen document in `offscreen.html` + `offscreen.mv3.js`.
- `platform/mv3/` — **upstream's uBlock Origin Lite** (DNR-based, separate extension). We don't modify this; let it follow upstream.

## Build

- `make chromium` — builds the main extension into `dist/build/uBlock0.chromium/`. This is what MV3 work targets.
- `make firefox` / `make mv3-chromium` / etc. — other targets (firefox is still MV2; `mv3-*` builds upstream's Lite).
- `make package-crx UPDATE_URL=...` — packages and signs as `.crx`. Key in `crx-signing-key.pem` (gitignored). Local commit `package and sign crx` (db9afcefa) added this.
- `make docker-package-crx` — same but in container (`Dockerfile`, `docker-compose.yml`).

## Local commits expected on top of upstream

Two commits sit on top of upstream + consolidated MV3 enablement:

1. **`package and sign crx`** — `Dockerfile`, `docker-compose.yml`, `Makefile` signing targets, npm `crx3` dependency.
2. **`add setup prompt page`** — opens `src/setup.html` on first run / when permissions missing; checks `chrome.userScripts.getScripts()` and `chrome.extension.isAllowedIncognitoAccess()`. `setup-check.js` loaded from `background.sw.js`.

## Upstream sync workflow (when bringing in new upstream changes)

The MV3 work cannot be rebased commit-by-commit on `upstream` because upstream's MV3-relevant code evolves continuously and would conflict at every replay. Use this consolidation flow instead:

1. Fetch both upstreams.
2. From `master`, merge `upstream-mv3/master` then `upstream/master` (auto-merge resolves most; only real conflicts surface).
3. `git reset --soft upstream/master` — HEAD moves to upstream tip, all combined changes are staged.
4. **Drop out-of-scope files** (upstream-mv3 author's publishing infra: `.github/index.html`, `.github/workflows/gh-pages.yml`, `build-signed-crx.sh`, their `README.md`).
5. **Drop local-commit files temporarily** — they'll be re-created as separate commits.
6. **Drop newline-only diffs** (e.g. `dist/version` if upstream's trailing-newline differs).
7. Commit the remaining staged set as a single "MV3 enablement for platform/chromium" commit.
8. Re-create the two local commits — `git add` the relevant files and `git commit -C <original-sha>` to preserve author/date/message. The original SHAs survive in reflog after the reset.
   - Patches saved by `git format-patch` will usually NOT apply cleanly because upstream evolves the same files (`.gitignore`, `Makefile`, `package-lock.json`, `package.json`). Falling back to staging current worktree content + `commit -C` is the working method.
9. Background.sw.js: when re-doing the "setup prompt page" commit, re-add the `import "/js/setup-check.js";` line by hand — the MV3 commit reset background.sw.js to the version without it.

## Audit notes on upstream-mv3

What the upstream-mv3 fork contains that this repo does NOT (yet/ever) take:

- `build-signed-crx.sh` — duplicates the local Makefile `package-crx` target with a different invocation (`pnpx crx3`). Skip.
- `.github/workflows/gh-pages.yml`, `.github/index.html` — publishes to `ublock.r58playz.dev`. Specific to that author. Skip.
- `README.md` rewrites referencing the above hosting / their extension ID `blockddmmcjpfkbhanlgegpmjpfpfjka`. Skip.

What is taken (folded into the MV3 enablement commit):

- userScripts hotpatch (`d75531c4c`) — origin of the popup banner / badge UX for "Allow User Scripts" being disabled. Touches `patches.js`, `popup-fenix.{css,html,js}`, `messaging.js`, `start.js`. The upstream-mv3 version used a 5-minute polling loop that blocked the entire SW startup chain; this fork replaced it with event-driven refresh — see "userScripts state handling" below.
- `storage.js` fix (`e90c05990`) — restored the admin-precedence line as `if ( Object.hasOwn(hsAdmin, key) ) { continue; }` (upstream had a typo of `name`; upstream-mv3 deleted the line). Required for managed-policy hidden-settings to take precedence over user values.

## userScripts state handling

`chrome.userScripts` requires the user to enable "Allow User Scripts" in extension settings. The toggle has no Chrome event we can subscribe to, so state changes are observed at user-action triggers, not via polling.

Single owner: `platform/chromium/patches.js` exposes `globalThis.__ubo_refreshUserScriptsState()`. It calls `chrome.userScripts.getScripts()`, caches the result in `globalThis.__ubo_hasUserScripts`, and updates the toolbar badge (`!` yellow when disabled, empty when enabled). Idempotent — safe to call any number of times.

Callers (the only places that need to refresh state):
- `patches.js` itself, at SW startup.
- `src/js/messaging.js` `popupDataFromTabId` — every popup open re-checks state. Handles the case where the user enabled userScripts outside the setup tab.
- `platform/chromium/setup-check.js` `onMessage` handler, on `userScriptsTurnedOn` from the setup page — covers the natural workflow where the setup tab is the user's transit point.

Scriptlet injection itself does *not* need re-registration when userScripts becomes available. The `chrome.tabs.executeScript` polyfill in `patches.js` calls `chrome.userScripts.execute()` *per-navigation*, not via a pre-registered set. Each future navigation just succeeds once the API is available — no retry logic needed in the registration path.

If you add a new place that depends on userScripts being on, gate it with `globalThis.__ubo_hasUserScripts` (or call `__ubo_refreshUserScriptsState()` first if you need fresh state).

## Service-worker constraints (gotchas when changing platform/chromium)

- Dynamic `import('./foo.js')` from extension code doesn't reliably work in MV3 service workers; convert to static `import * as foo from './foo.js'` at the top of the module. This is why `messaging.js` was changed.
- No DOM in service worker → anything that needs `document` (e.g. parsing HTML, executing inline `<script>`) goes through the offscreen document (`offscreen.html` + `offscreen.mv3.js`).
- `chrome.userScripts` requires the user to enable "Allow User Scripts" in the extension settings. Until then, scriptlet filters silently no-op. The userScripts hotpatch surfaces this in the popup.
- `webRequestBlocking` only works under MV3 if the extension is allowlisted (policy force-install OR `--allowlisted-extension-id=<id>` Chrome flag). Without it, this fork degrades to ineffective.

## Files this fork ignores from upstream-mv3 history (for future merges)

If a future upstream-mv3 merge re-introduces any of these, drop them in step 4 above:

- `build-signed-crx.sh`
- `.github/index.html`
- `.github/workflows/gh-pages.yml` (their version)
- `README.md` rewrites referencing `r58playz` infrastructure
