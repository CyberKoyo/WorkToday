# Job Application Filler

Browser extension (Chrome + Firefox) that fills Workday, Greenhouse, iCIMS, Oracle Recruiting Cloud, SAP SuccessFactors, Ashby, ADP, Eightfold and Phenom job applications from your reviewed resume profile.

- `extension/` — WXT extension. `npm run dev -w extension` (Chrome) / `npm run dev:firefox -w extension`.
- `server/` — Cloudflare Worker that maps form labels to profile keys with Llama 3.1 8B on Workers AI. `npm run deploy -w server`.
- `shared/` — request/response contract.

## Supported sites

| ATS | Hosts | Notes |
| --- | --- | --- |
| Workday | `*.myworkdayjobs.com`, `*.myworkday.com` | Adds work/education groups to match your profile, uploads the resume, and moves through the steps by itself up to Review (Submit is yours). Ticks "I have read and consent to the terms and conditions" on Voluntary Disclosures, which agrees to them for you. Signing in is yours. |
| Greenhouse | `job-boards.greenhouse.io`, `boards.greenhouse.io`, Greenhouse forms embedded on company sites | Adds education groups. |
| iCIMS | `*.icims.com` (form runs inside an iframe) | Extra work/education rows: add them yourself, then press Auto-fill again. |
| Oracle Recruiting Cloud | `*.oraclecloud.com/hcmUI/CandidateExperience/…` | Adds and saves work/education history entries. The sign-in / email step is yours. |
| SAP SuccessFactors | `careerN.successfactors.com`/`.eu`, `careerN.sapsf.com`/`.eu` (`/career?…`) | Fills the one-page apply form and attaches the resume. Password, cover letter, personal website link and the privacy statement are yours. |
| Ashby | `jobs.ashbyhq.com` (`/…/application`) | Fills the application tab and the EEO survey. The "Autofill from resume" box is left alone. |
| ADP Recruiting Management | `recruiting.adp.com`, `recruiting2.adp.com` (reached from `myjobs.adp.com`) | Fills contact details (Country/State/County lists included), the EEO step from your profile, the source list, the resume upload, and the screening questions as each one appears. A question revealed only by one of Gemini's answers needs another press of Auto-fill. The tax credit (WOTC) screening is opted out of by itself: Opt Out, confirm, "Under 40?" and (if under 40) your date of birth from your profile, Submit. Ticks "Reviewed" under the data protection and electronic signature notices, which agrees to them for you. Signing in on `myjobs.adp.com` is yours. |
| Eightfold | `*.eightfold.ai/careers/apply?pid=…`, `careers.qualcomm.com` | Fills contact details, country lists and questions, and attaches the resume. A field that appears after an answer (State after Country) needs another press of Auto-fill. Signing in (Qualcomm, Northrop Grumman) is yours. |
| Phenom apply | `careers.steris.com`, `jobs.cvshealth.com` (`/…/apply?jobSeqNo=…`) | Fills the "My Information" step and attaches the resume. Terms/privacy consent boxes are yours. Later steps go through the generic reader; work/education rows are not added yet. |

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
5. On a supported application, press **Auto-fill** in the banner. When it fills every field on a step with nothing left for you,
   it presses Next and fills the following step too. It stops at any step with a highlighted field, and before the final submit.
   Gemini's answers (blue) count as filled, so check them on the site's review page before you submit.

### Self-hosting the mapping server (optional)

The extension uses the hosted mapping Worker by default (`extension/src/api/apiBase.ts`). To run your own,
deploy it to your Cloudflare account (`npm run deploy -w server`) and set `WXT_API_BASE` in `extension/.env`
to its URL (or `http://localhost:8787` for `npm run dev -w server`), then rebuild the extension.

## Privacy

Your resume goes only to Google Gemini under your key. The mapping server only sees form labels, never your data.
Questions no profile field covers go to Gemini too, under your key, with your profile minus the answers you enter by hand
(work authorization, sponsorship, EEO). Gemini picks only from the options a question offers; its answers are outlined blue
for you to check. Work authorization, sponsorship, demographic, consent, salary and essay questions are never sent.
Answers you type into highlighted fields are saved in the extension (this browser only) and reused when the same question comes up again,
written answers included (except "why…" questions, which are about one employer). Written questions are never sent to Gemini.
Your date of birth stays in this browser and is used only for ADP's tax credit opt-out; it never goes to Gemini or the mapping server, and no other form gets it.
The extension never overwrites a field that already has a value and never submits an application. It moves to the next step
only when every field on the current one was filled, and only through a button named Next or Continue (ADP: the pager arrow, never on the last step).

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
