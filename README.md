# Job Application Filler

Browser extension (Chrome + Firefox) that fills job applications from your reviewed resume profile: automatically on Workday, Greenhouse, iCIMS, Oracle Recruiting Cloud, SAP SuccessFactors, Ashby, ADP, Eightfold, Phenom, Lever, SmartRecruiters, Dayforce and Tesla, and on any other site from the toolbar button. It logs each application you fill (name, date, link) on its dashboard and,
once connected, in a Google Sheet, and drafts answers to essay questions for you to edit.

- `extension/` — WXT extension. `npm run dev -w extension` (Chrome) / `npm run dev:firefox -w extension`.
- `server/` — Cloudflare Worker that maps form labels to profile keys with Llama 3.1 8B on Workers AI. `npm run deploy -w server`.
- `shared/` — request/response contract.

## Supported sites

| ATS | Hosts | Notes |
| --- | --- | --- |
| Workday | `*.myworkdayjobs.com`, `*.myworkday.com` | Adds work/education/certification groups to match your profile, uploads the resume and each certification's proof, and moves through the steps by itself up to Review (Submit is yours). Ticks "I have read and consent to the terms and conditions" on Voluntary Disclosures, which agrees to them for you. With an account password saved in setup, creates your account for that employer (or signs in when the email already has one) and ticks the account form's "I agree" box, which agrees to those terms for you; a refused password is tried once, then signing in is yours. Without one, signing in is yours. |
| Greenhouse | `job-boards.greenhouse.io`, `boards.greenhouse.io`, Greenhouse forms embedded on company sites | Adds education groups. |
| iCIMS | `*.icims.com` (form runs inside an iframe) | Extra work/education rows: add them yourself, then press Auto-fill again. |
| Oracle Recruiting Cloud | `*.oraclecloud.com/hcmUI/CandidateExperience/…` | Adds and saves work/education history entries. The sign-in / email step is yours. |
| SAP SuccessFactors | `careerN.successfactors.com`/`.eu`, `careerN.sapsf.com`/`.eu` (`/career?…`) | Fills the one-page apply form and attaches the resume. Password, cover letter, personal website link and the privacy statement are yours. |
| Ashby | `jobs.ashbyhq.com` (`/…/application`) | Fills the application tab and the EEO survey. The "Autofill from resume" box is left alone. |
| ADP Recruiting Management | `recruiting.adp.com`, `recruiting2.adp.com` (reached from `myjobs.adp.com`) | Fills contact details (Country/State/County lists included), the EEO step from your profile, the source list, the resume upload, and the screening questions as each one appears. A question revealed only by one of Gemini's answers needs another press of Auto-fill. The tax credit (WOTC) screening is opted out of by itself: Opt Out, confirm, "Under 40?" and (if under 40) your date of birth from your profile, Submit. Ticks "Reviewed" under the data protection and electronic signature notices, which agrees to them for you. Signing in on `myjobs.adp.com` is yours. |
| Eightfold | `*.eightfold.ai/careers/apply?pid=…`, `careers.qualcomm.com` | Fills contact details, country lists and questions, and attaches the resume. A field that appears after an answer (State after Country) needs another press of Auto-fill. Signing in (Qualcomm, Northrop Grumman) is yours. |
| Phenom apply | `careers.steris.com`, `jobs.cvshealth.com` (`/…/apply?jobSeqNo=…`) | Fills the "My Information" step and attaches the resume. Terms/privacy consent boxes are yours. Later steps go through the generic reader; work/education rows are not added yet. |
| Lever | `jobs.lever.co`, `jobs.eu.lever.co` (`/…/apply`) | Fills the one-page form, its custom question cards and the EEO section, searches "Current location" for your city, and attaches the resume. Agreement checkboxes and the captcha on Submit are yours. |
| SmartRecruiters | `jobs.smartrecruiters.com` (`/oneclick-ui/…`) | Fills names, email, phone, profile links and the message box, and attaches the resume. Experience and Education entries ("Add") and the screening step after Next are yours. |
| Dayforce | `jobs.dayforcehcm.com` ("Apply without an Account") | Fills Candidate Info, its dropdowns, and the open education and employment entry, and attaches the resume. State/Province unlocks after Country, so it needs another press of Auto-fill. Saving each entry (Update), further entries and the privacy statement are yours. |
| Tesla | `www.tesla.com/careers/search/job/apply/…` | Fills the "Personal Information" step and attaches the resume. Later steps go through the same reader but were not seen live. |
| Any other site, including employers' own careers sites (Meta, Amazon, Microsoft) | Click the toolbar button on the application page. With **Allow on all sites** (dashboard → Settings) the banner shows by itself when a careers page has a form asking for your name, email, phone or resume | Uses the generic form reader. Same as iCIMS for extra rows. Without the permission, click the button again after moving to a new site. |

## Setup

You need Node.js and a Gemini API key. No server setup is required.

1. Install: `npm install`.
2. Build: `npm run build -w extension` (`.output/chrome-mv3`) and `npm run build:firefox -w extension` (`.output/firefox-mv2`).
3. Load it:
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3`.
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/.output/firefox-mv2/manifest.json`
     (temporary add-ons are removed when Firefox restarts).
4. Open the extension's options page (the dashboard; it lists what is left to set up). Under Settings, press **Get a free key**,
   create a Gemini API key in Google AI Studio and paste it: it is saved and checked on paste. Under Profile, add your resume
   (PDF, .docx or .txt; several versions at once if you keep them — they are read together into one profile, and the first
   is the file attached to applications unless you pick another), press **Read resumes**, review every field (personal projects
   are read off the resume too, and you can add ones it does not list; Gemini uses them for answers and essay drafts) (work authorization, sponsorship and EEO answers are never inferred — enter them
   yourself), and save. Optional, under Settings: an **Account password** for the accounts Workday asks you to create.
5. On a supported application, press **Auto-fill** in the banner. On any other site, click the extension's toolbar button
   to bring up the banner first. When it fills every field on a step with nothing left for you, it presses Next and fills the
   following step too. It stops at any step with a highlighted field, and before the final submit. Gemini's answers (blue)
   count as filled, so check them on the site's review page before you submit.

### Job loop

Work down a whole list of jobs from a job board (jobright.ai, or any board whose jobs have a button or link starting with
"Apply", "Easy Apply" or "Quick Apply"):

1. Once: dashboard → Settings → **Allow on all sites**. Jobs lead to any site, so the loop needs to run on all of them.
2. Once per board: allow pop-ups for the board's site (the address bar shows a blocked-pop-up icon the first time). The loop
   presses the board's Apply buttons for you, and browsers block tabs opened without a real click.
3. Optional, dashboard → Settings → **Job loop**: a sign-in email and password for applications that want an account first,
   and **Submit applications for me**.
4. On the board, click the toolbar button and press **Loop jobs**. Each job opens in its own tab and is stepped there: sign in
   if asked, press the posting's Apply button if the form is one click away, Auto-fill each step. When a board shows the
   application inside its own page instead of a new tab, it is filled there. Then the loop returns to the board for the next
   job, scrolling the list for more when it runs out. **Stop** ends it after the job it is on; so does closing the banner or
   the board's tab. It pauses by itself after 25 jobs.

With submitting off, every tab is left filled for you to review and send. With it on, the loop also presses Next / Save and
Continue / Submit, but only on a step where Auto-fill left nothing highlighted for you; any other job is left open at that
step. The closing line counts jobs as *sent* (Submit was pressed and the form went away: check the tab for the site's
confirmation), *filled*, *need you*, or *no form*.

- The sign-in is tried once per page. It does not tick terms boxes, switch from "create account" to "sign in" when the
  account already exists, or handle logins that ask for the email and password on separate pages.
- Sites that check for a human (CAPTCHA) may refuse a Submit pressed by the extension; those jobs end as *need you*.
- A board with one Apply button for the selected job (LinkedIn's layout) gets only that job: the loop does not pick jobs
  from a side list. More jobs come from scrolling, not from numbered pages.

### Application log and Google Sheets

The first time you press Auto-fill on an application, the dashboard logs its page title, the date and the link.
Nothing detects that you submitted: the date is the day you filled it.

Google Sheets sync is off until the build has a Google OAuth client ID (one-time, by whoever builds the extension; free):

1. In a Google Cloud project, enable the **Google Sheets API** and set up the OAuth consent screen with the one scope
   `https://www.googleapis.com/auth/drive.file` (non-sensitive: the extension only sees the spreadsheet it creates).
2. Create an OAuth client ID of type **Web application**. Add the extension's redirect URL as an authorized redirect URI:
   `https://<extension-id>.chromiumapp.org/` for Chrome; for Firefox, the value of `browser.identity.getRedirectURL()`
   (run it in the extension's background console). The extension ID must stay the same between builds: it does once the
   extension is in the Chrome Web Store, or with a fixed `key` in the manifest.
3. Put the client ID in `extension/.env` as `WXT_GOOGLE_CLIENT_ID=….apps.googleusercontent.com` and rebuild.

Users then press **Connect Google Sheets** on the dashboard and approve Google's prompt once. The extension creates a
"Job Applications" spreadsheet in their Drive and adds a row per application. Google's sign-in lasts an hour and renews
without a prompt while the browser is signed in to Google; if it cannot, rows wait on the dashboard until **Sync now**.

### What runs where

Everything runs in the user's browser, and their data stays in the extension's storage on their machine. The only service
this project hosts is the mapping Worker below (form labels in, profile field names out). Gemini is called directly under
the user's key and Google Sheets directly under the user's Google sign-in, so neither needs a server of ours.

### Self-hosting the mapping server (optional)

The extension uses the hosted mapping Worker by default (`extension/src/api/apiBase.ts`). To run your own,
deploy it to your Cloudflare account (`npm run deploy -w server`) and set `WXT_API_BASE` in `extension/.env`
to its URL (or `http://localhost:8787` for `npm run dev -w server`), then rebuild the extension.

## Privacy

Your resumes (every version you add) go only to Google Gemini under your key. The mapping server only sees form labels, never your data.
Questions no profile field covers go to Gemini too, under your key, with your profile minus the answers you enter by hand
(work authorization, sponsorship, salary, EEO; your earliest start date, relocation answer and whether you worked at the employer
before are sent). Gemini picks only from the options a question offers; on Greenhouse and unlisted sites a dropdown is opened and
closed again to read them. Its answers are outlined blue for you to check. Two answers follow a rule, not a fact you entered: with
no earliest start date in the profile, "are you available from / for …" is answered yes; "which locations are you open to" takes
every location when you are willing to relocate, otherwise only those in your city or state. An empty free-text box ("Why do you want to work here?") gets a draft in a Gemini request of its own, written from your
profile and your stored resume files, all versions (so projects and coursework the profile has no field for can be used); the tab's title and
the job description (up to 8,000 characters) go along so the draft can refer to the job. On Greenhouse the description comes
from Greenhouse's public job API (the request names only the employer's board and the job id); elsewhere it is the visible
text of the form's own page. Edit the draft: it is
a starting point, not your words. Work authorization, sponsorship, demographic, consent and salary questions are never sent.
A required consent checkbox (one the form will not continue without) is ticked for you and outlined blue, and the summary
says how many: read what you are agreeing to before you submit. Optional checkboxes are left alone.
The application log stays in the extension; with Google Sheets connected, each entry's name, date and link also go to your sheet.
Answers you type into highlighted fields are saved in the extension (this browser only) and reused when the same question comes up again,
written answers included (except "why…" questions, which are about one employer); a saved written answer is used instead of a new draft.
The account password is stored unencrypted in the extension (this browser only) and is typed only into a site's own password boxes; it never goes to Gemini or the mapping server. Use one made for job applications.
Your date of birth stays in this browser and is used only for ADP's tax credit opt-out; it never goes to Gemini or the mapping server, and no other form gets it.
The extension never overwrites a field that already has a value, and never submits an application unless you turn on
**Submit applications for me** for the job loop. On its own it moves to the next step only when every field on the current one
was filled, and only through a button named Next or Continue (ADP: the pager arrow, never on the last step). The loop's sign-in email and password are stored unencrypted in the extension
(this browser only) and typed only into the sign-in form of the site that asks; they are never sent to Gemini or the mapping server.

## Known limitations

- Forms drawn inside shadow DOM (some company-built career sites) are not seen by the generic reader.
- The application log has one row per page address, so an application whose steps change the address can log more than one row.
- Essay drafts ignore a box's character limit; trim them if the site complains.
- Outside Greenhouse, an essay draft sees the job description only when it is on the same page as the form. Systems that
  move the form to its own page (Workday, iCIMS, Oracle, SuccessFactors, Ashby's application tab) give the draft the title only.
- Searchable prompts (Skills, Field of Study) are filled by searching each value. Values with no clear result are
  skipped, highlighted, and named in the summary ("Not added, fill in by hand: …").
- When Workday accepts free text on Enter, your exact wording is entered even if a catalog entry exists.
- Prompts with nested categories (often "How did you hear about us") are left for manual entry.
- Option matching ignores `+` and `#`, so "C++" or "C#" can match an option named "C".
- Company career sites that build their own form on top of Greenhouse's API (not the Greenhouse iframe) are not detected.
- Oracle Taleo (`*.taleo.net`) and other unlisted sites work only through the toolbar button, with the generic reader.
- From the toolbar button, a form inside a frame from another site (an embedded application on a company page) may not be reached.
- SuccessFactors career sites on a company's own domain (`jobs.acme.com`) are not detected.
- SuccessFactors picklist options load only when opened, so the mapper sees the question without its choices.
- Dropdown choices are read for Gemini only on Greenhouse and unlisted sites; on the other supported systems a dropdown the
  profile cannot answer is highlighted for you.
- "How did you hear about us": with no default answer in the profile, the employer's own careers page is chosen (or "Other"
  when the list has no such choice) and outlined blue. Set your own default under Profile to replace it.
- Searchable dropdowns (Greenhouse School, Location) pick a result only when exactly one clearly matches; otherwise the field is highlighted.
- iCIMS dropdowns are set through the underlying list; if a dropdown looks empty after Auto-fill, pick the value by hand.

## Tests

`npm test` runs the shared, server, and extension suites.
