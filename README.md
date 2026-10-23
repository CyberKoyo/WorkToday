# Job Application Filler

Browser extension (Chrome + Firefox) that fills Workday, Greenhouse, iCIMS, Oracle Recruiting Cloud, SAP SuccessFactors and Ashby job applications from your reviewed resume profile.

- `extension/` — WXT extension. `npm run dev -w extension` (Chrome) / `npm run dev:firefox -w extension`.
- `server/` — Cloudflare Worker that maps form labels to profile keys with Llama 3.1 8B on Workers AI. `npm run deploy -w server`.
- `shared/` — request/response contract.

## Supported sites

| ATS | Hosts | Notes |
| --- | --- | --- |
| Workday | `*.myworkdayjobs.com`, `*.myworkday.com` | Adds work/education groups to match your profile. |
| Greenhouse | `job-boards.greenhouse.io`, `boards.greenhouse.io`, Greenhouse forms embedded on company sites | Adds education groups. |
| iCIMS | `*.icims.com` (form runs inside an iframe) | Extra work/education rows: add them yourself, then press Auto-fill again. |
| Oracle Recruiting Cloud | `*.oraclecloud.com/hcmUI/CandidateExperience/…` | Adds and saves work/education history entries. The sign-in / email step is yours. |
| SAP SuccessFactors | `careerN.successfactors.com`/`.eu`, `careerN.sapsf.com`/`.eu` (`/career?…`) | Fills the one-page apply form and attaches the resume. Password, cover letter, personal website link and the privacy statement are yours. |
| Ashby | `jobs.ashbyhq.com` (`/…/application`) | Fills the application tab and the EEO survey. The "Autofill from resume" box is left alone. |

## Setup

You need Node.js and a Gemini API key. No server setup is required.

1. Install: `npm install`.
2. Build: `npm run build -w extension` (`.output/chrome-mv3`) and `npm run build:firefox -w extension` (`.output/firefox-mv2`).
3. Load it:
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3`.
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/.output/firefox-mv2/manifest.json`
     (temporary add-ons are removed when Firefox restarts).
4. Open the extension's options page, add your Gemini API key (https://aistudio.google.com), upload your resume (PDF, .docx or .txt),
   review every field (work authorization, sponsorship and EEO answers are never inferred — enter them yourself), and save.
5. On a supported application, press **Auto-fill** in the banner on each step. Review the highlighted fields, then continue yourself.

### Self-hosting the mapping server (optional)

The extension uses the hosted mapping Worker by default (`extension/src/api/apiBase.ts`). To run your own,
deploy it to your Cloudflare account (`npm run deploy -w server`) and set `WXT_API_BASE` in `extension/.env`
to its URL (or `http://localhost:8787` for `npm run dev -w server`), then rebuild the extension.

## Privacy

Your resume goes only to Google Gemini under your key. The mapping server only sees form labels, never your data.
Questions no profile field covers go to Gemini too, under your key, with your profile minus the answers you enter by hand
(work authorization, sponsorship, EEO). Gemini picks only from the options a question offers; its answers are outlined blue
for you to check. Work authorization, sponsorship, demographic, consent, salary and essay questions are never sent.
Answers you type into highlighted fields are saved in the extension (this browser only) and reused when the same question comes up again.
The extension never overwrites a field that already has a value and never submits or advances an application.

## Known limitations

- Searchable prompts (Skills, Field of Study) are filled by searching each value. Values with no clear result are
  skipped, highlighted, and named in the summary ("Not added, fill in by hand: …").
- When Workday accepts free text on Enter, your exact wording is entered even if a catalog entry exists.
- Prompts with nested categories (often "How did you hear about us") are left for manual entry.
- Option matching ignores `+` and `#`, so "C++" or "C#" can match an option named "C".
- Company career sites that build their own form on top of Greenhouse's API (not the Greenhouse iframe) are not detected.
- Oracle Taleo (`*.taleo.net`) is not supported.
- SuccessFactors career sites on a company's own domain (`jobs.acme.com`) are not detected.
- SuccessFactors picklist options load only when opened, so the mapper sees the question without its choices.
- Searchable dropdowns (Greenhouse School, Location) pick a result only when exactly one clearly matches; otherwise the field is highlighted.
- iCIMS dropdowns are set through the underlying list; if a dropdown looks empty after Auto-fill, pick the value by hand.

## Tests

`npm test` runs the shared, server, and extension suites.
