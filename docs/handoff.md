# Handoff — 2026-10-10

## Where things stand
- Repo: github.com/CyberKoyo/WorkToday (private). Local clone: `~/Desktop/workToday/WorkToday`; the parent `~/Desktop/workToday` is not a repo.
- Branch: **`gursimar/dev`**, cut from `main` @ `a72710e`. One commit on top: "feat(extension): toolbar button fills applications on any site", which also carries this file.
- `docs/` is gitignored; this file was force-added (`git add -f`) so remote sessions get it. Other docs there stay local.
- All green at `4a8ef60`: `npm test` → shared 5, server 19, extension 233; `npx tsc --noEmit -p extension` clean; `npm run build -w extension` and `build:firefox` succeed.
- **Not yet tried in a real browser.** The toolbar flow has only been covered by unit tests (happy-dom).
- In a remote/cloud session there is no desktop browser: you can run tests, builds and the server code, but real-site checks (next step 1) need the user's machine.

## The project in one paragraph
Job Application Filler: a WXT browser extension (Chrome MV3 + Firefox MV2) plus a Cloudflare Worker. The setup page parses a resume with Gemini (user's own key, kept in `browser.storage.local`) into a 39-key profile (`shared/src/contract.ts`), which the user reviews. On a job page the extension extracts labels → background → Worker `/v1/map-fields` (Llama 3.1 8B, schema-constrained to profile keys, labels only, never user data) → fills each field. Dropdown/radio values are matched deterministically by `extension/src/fill/matchOption.ts`. It never overwrites a filled field and never submits.

## What this session added (commit 4a8ef60)
Run on **any** site via the toolbar button, using `activeTab` + `scripting`, with no new host permissions and no "all sites" install warning.
- `src/generic/adapter.ts`: `generic` adapter. `applicationRoot()` takes the form holding most fields, skipping search/login/alert forms (`notApplication`, moved here from iCIMS) and minor ones like newsletters; falls back to `document.body`. `ensureGroups` is a no-op.
- `src/autofill/mount.ts`: shared banner mounting for both scripts. A global `__wfMounted` in the content-script isolated world lets the toolbar script reuse a supported site's banner. Fixed a race: the old banner is removed *after* `await getProfile()`.
- `src/autofill/manual.ts` + `entrypoints/manual.ts` (unlisted script → `/manual.js`): toolbar logic. Frames without a form stay quiet; the top frame always shows a banner.
- `src/background/injectManual.ts`: `executeScript` with `allFrames: true`, retrying the top frame alone if any frame refuses.
- `entrypoints/background.ts`: `(browser.action ?? browser.browserAction).onClicked`.
- `wxt.config.ts`: permissions + `action.default_title`. WXT converts `action` to `browser_action` for MV2 (checked in the built manifest).
- Smaller: `formatReport` says "Found nothing to fill on this page." when the run is empty; setup page message no longer says "ready on Workday"; README updated.

## How to run
```
git switch gursimar/dev   # in a fresh clone
npm install
npm run dev -w extension      # WXT does NOT auto-open a browser here
```
- Load `extension/.output/chrome-mv3-dev` via `chrome://extensions` → Load unpacked. `.output` is hidden in Finder: press Cmd+Shift+. to show it.
- After manifest changes, press the reload icon on the extension.
- The Gemini key is entered on the extension's Options page, not in `.env`. `.env` only takes `WXT_API_BASE`.
- Hosted Worker: `https://worktoday.keikoyoter-ui.workers.dev` (health + map-fields verified live this session). Local `wrangler dev --remote` needs `wrangler login`, which has not been done.

## Next steps (agreed direction)
1. **Real-browser check of the toolbar flow.** Load the extension, open unlisted sites (amazon.jobs, a small company form, a Lever/Ashby/SmartRecruiters page), click the icon, press Auto-fill. Note which fields are skipped or highlighted, and why: extraction, custom widget, or option matching.
2. **Optional "Always offer on this site"**: `optional_host_permissions` + `browser.permissions.request` + `scripting.registerContentScripts` so the banner appears automatically on sites the user opts into.
3. **ML for option matching** (the user's idea, scoped down). The label→key step is already done by the server LLM, so the gap is value→option. Plan, preserving the privacy promise (the server never sees user answers):
   - (a) For enumerated keys (yes/no, veteran, gender, ethnicity, disability, decline), send only the site's **option list** to the Worker and ask which option means each canonical value (the `CHOICES` in `src/options/profileForm.ts`); pick locally.
   - (b) For free-text values (degree, school, field of study), consider on-device similarity (transformers.js MiniLM, about 25 MB) or Chrome's built-in Gemini Nano (Chrome-only). Use as a fallback after `matchOption` returns -1.
   - Decide based on what step 1 shows.

## Known issues / loose ends
- `npm audit`: 3 high, all from `sharp` via `wrangler` → `miniflare` (server dev tooling only). `npm audit fix` is likely enough; not done.
- No `version` in `extension/package.json` (WXT warns and defaults to 0.0.0). Needed before store submission.
- The map cache wipes entirely at more than 2000 entries (`src/storage/store.ts`) instead of trimming.
- vitest 5 warns about Node 25 (engine range); tests run fine.
- Generic flow limits: no auto "Add" for extra work/education rows; cross-origin iframe forms may be unreachable from the toolbar.

## User preferences seen this session
- Wants commits **without** the `Co-Authored-By` trailer (said for the last commit; not stated as permanent, so confirm or follow it).
- Prefers explanations of how things work before building; agreed to the recommended order (any-site support → test on real sites → ML).
- Commit style in repo: conventional commits, scoped (`feat(extension): …`, `fix(extension): …`).
