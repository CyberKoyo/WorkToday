# Job Application Filler

Browser extension (Chrome + Firefox) that fills job applications from your reviewed resume profile: automatically on Workday, Greenhouse, iCIMS and Oracle Recruiting Cloud, and on any other site from the toolbar button.

- `extension/` — WXT extension. `npm run dev -w extension` (Chrome) / `npm run dev:firefox -w extension`.
- `server/` — Cloudflare Worker that maps form labels to profile keys with Llama 3.1 8B on Workers AI. `npm run deploy -w server`.
- `shared/` — request/response contract.

## Supported sites

| ATS | Hosts | Notes |
| --- | --- | --- |
| Workday | `*.myworkdayjobs.com`, `*.myworkday.com` | Adds work/education groups to match your profile. |
| Greenhouse | `job-boards.greenhouse.io`, `boards.greenhouse.io`, Greenhouse forms embedded on company sites | Adds education groups. |
| iCIMS | `*.icims.com` (form runs inside an iframe) | Extra work/education rows: add them yourself, then press Auto-fill again. |
| Oracle Recruiting Cloud | `*.oraclecloud.com/hcmUI/CandidateExperience/…` | Same as iCIMS for extra rows. The sign-in / email step is yours. |
| Any other site | Click the toolbar button on the application page | Uses the generic form reader. Same as iCIMS for extra rows. Click the button again after moving to a new site. |

## Setup

You need Node.js and a Gemini API key. No server setup is required.

1. Install: `npm install`.
2. Build: `npm run build -w extension` (`.output/chrome-mv3`) and `npm run build:firefox -w extension` (`.output/firefox-mv2`).
3. Load it:
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3`.
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/.output/firefox-mv2/manifest.json`
     (temporary add-ons are removed when Firefox restarts).
4. Open the extension's options page, add your Gemini API key (https://aistudio.google.com), upload a PDF resume,
   review every field (work authorization, sponsorship and EEO answers are never inferred — enter them yourself), and save.
5. On a supported application, press **Auto-fill** in the banner on each step. On any other site, click the extension's toolbar button
   to bring up the banner first. Review the highlighted fields, then continue yourself.

### Self-hosting the mapping server (optional)

The extension uses the hosted mapping Worker by default (`extension/src/api/apiBase.ts`). To run your own,
deploy it to your Cloudflare account (`npm run deploy -w server`) and set `WXT_API_BASE` in `extension/.env`
to its URL (or `http://localhost:8787` for `npm run dev -w server`), then rebuild the extension.

## Privacy

Your resume goes only to Google Gemini under your key. The mapping server only sees form labels, never your data.
The extension never overwrites a field that already has a value and never submits or advances an application.

## Known limitations

- Searchable prompts (Skills, Field of Study) are filled by searching each value. Values with no clear result are
  skipped, highlighted, and named in the summary ("Not added, fill in by hand: …").
- When Workday accepts free text on Enter, your exact wording is entered even if a catalog entry exists.
- Prompts with nested categories (often "How did you hear about us") are left for manual entry.
- Option matching ignores `+` and `#`, so "C++" or "C#" can match an option named "C".
- Company career sites that build their own form on top of Greenhouse's API (not the Greenhouse iframe) are not detected.
- Oracle Taleo (`*.taleo.net`) and other unlisted sites work only through the toolbar button, with the generic reader.
- From the toolbar button, a form inside a frame from another site (an embedded application on a company page) may not be reached.
- Searchable dropdowns (Greenhouse School, Location) pick a result only when exactly one clearly matches; otherwise the field is highlighted.
- iCIMS dropdowns are set through the underlying list; if a dropdown looks empty after Auto-fill, pick the value by hand.

## Tests

`npm test` runs the shared, server, and extension suites.
