# Workday Filler

Browser extension (Chrome + Firefox) that fills Workday job applications from your reviewed resume profile.

- `extension/` — WXT extension. `npm run dev -w extension` (Chrome) / `npm run dev:firefox -w extension`.
- `server/` — Cloudflare Worker that maps form labels to profile keys with Llama 3.1 8B on Workers AI. `npm run deploy -w server`.
- `shared/` — request/response contract.

## Setup

1. Deploy the server (`npm run deploy -w server`). The extension points at the deployed Worker by default
   (`extension/src/api/apiBase.ts`); set `WXT_API_BASE` in `extension/.env` to override it, e.g.
   `http://localhost:8787` for `wrangler dev`.
2. Build: `npm run build -w extension` (`.output/chrome-mv3`) and `npm run build:firefox -w extension` (`.output/firefox-mv2`).
3. Load it:
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3`.
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/.output/firefox-mv2/manifest.json`
     (temporary add-ons are removed when Firefox restarts).
4. Open the extension's options page, add your Gemini API key (https://aistudio.google.com), upload a PDF resume,
   review every field (work authorization, sponsorship and EEO answers are never inferred — enter them yourself), and save.
5. On a Workday application, press **Auto-fill** in the banner on each step. Review the highlighted fields, then continue yourself.

## Privacy

Your resume goes only to Google Gemini under your key. The mapping server only sees form labels, never your data.
The extension never overwrites a field that already has a value and never submits or advances an application.

## Known limitations

- Searchable prompts (Skills, Field of Study) are filled by searching each value. Values with no clear result are
  skipped, highlighted, and named in the summary ("Not added, fill in by hand: …").
- When Workday accepts free text on Enter, your exact wording is entered even if a catalog entry exists.
- Prompts with nested categories (often "How did you hear about us") are left for manual entry.
- Option matching ignores `+` and `#`, so "C++" or "C#" can match an option named "C".

## Tests

`npm test` runs the shared, server, and extension suites.
