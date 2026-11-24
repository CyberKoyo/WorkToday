# Store listing text

Copy these into the two store forms.

## Shared

**Name:** Job Application Filler

**Summary / short description** (AMO max 250 chars, Chrome max 132):

> Auto-fill job applications from your reviewed resume profile and keep a log of where you applied.

**Description:** (do not list every supported site: Chrome rejected that as keyword spam, 2026-11-24)

> Job Application Filler fills job application forms for you from a profile you build once and review yourself.
>
> How it works
> • Add your resume (PDF, DOCX or text). Google Gemini, under your own free API key, reads it into a profile: contact details, education, work history, skills. You check every field and fill in what only you can answer (work authorization, sponsorship, demographic questions).
> • On an application page, press Auto-fill. The extension reads the form's labels, matches each box to your profile, fills it, attaches your resume, and outlines in blue anything it guessed so you can check it. It never overwrites a field that already has a value.
> • Open questions ("Why do you want to work here?") get a draft written from your profile and the job description, for you to edit.
> • Every application you fill is logged with the date, link and job location, with a status you can update.
> • Job loop (optional): on a job board, work down the list of postings one tab at a time, filling each application for you to review.
>
> Works on most job application systems, including Workday, Greenhouse, Lever and iCIMS. On any other site, press the toolbar button to fill the form on the page.
>
> Your data
> • Your profile, resumes, saved answers and application log stay in your browser.
> • Resumes, job page text and the questions no profile field covers go to Google Gemini under your own key. Work authorization, sponsorship, salary and demographic answers are never sent.
> • Only the form's labels (never your answers) go to the extension's mapping server, to decide which box is which.
> • No analytics, no tracking, no ads. Delete all my data (in Settings) clears everything the extension stored.
>
> You stay in control: the extension does not submit applications unless you turn that on for the job loop. Read every filled form before you submit.
>
> Needs a free Google Gemini API key from Google AI Studio.

**Category:** Chrome: Productivity → Workflow & Planning. AMO: pick the closest category the form offers (for example
"Other").

**Support email:** worktodaysupport@gmail.com

**Privacy policy:** `store/PRIVACY.md`. Public URL, once the server is redeployed: https://worktoday.keikoyoter-ui.workers.dev/privacy
(AMO: paste the text or give the URL; Chrome: the URL).

**Store images:** icon `extension/public/icon/128.png`; small promo tile `store/promo-tile-440x280.png`; screenshots
(1280x800, in this order) `store/screenshots/1-banner.png` (the banner on an application form), `2-filled.png` (after
Auto-fill: filled fields, the one left for you outlined), `3-dashboard.png` (dashboard and application log),
`4-profile.png` (the profile you review). They show a demo form and a made-up profile.

## Firefox (addons.mozilla.org)

**Source code:** yes, required (the code is bundled by Vite). Upload `extension/.output/extension-1.0.0-sources.zip`.

**License:** All Rights Reserved (the repository is private), unless you choose an open-source license.

**Notes to reviewer:**

> Build: Node.js 24 and npm 11. Unzip the source package, then from its root run
> `npm ci && npm run build:firefox -w extension`. The output is `extension/.output/firefox-mv2`, identical to the
> uploaded package. No .env file is needed: without one the build uses the hosted mapping server
> (https://worktoday.keikoyoter-ui.workers.dev) and leaves the optional Google Sheets sync out.
>
> Testing without a Gemini key: the setup page opens on install (later: about:addons → Job Application Filler →
> Options, or press the toolbar button on any page and then "Open setup"). Click Profile in the sidebar, type a name and email and press "Save & mark reviewed". Then open any public
> Greenhouse job application (a job-boards.greenhouse.io posting's application form) and press Auto-fill on the banner
> at the bottom right. Please do not submit. A Gemini key (free, from Google AI Studio) is only needed to read a resume
> and to answer or draft open questions.
>
> Remote services: generativelanguage.googleapis.com (the user's own Gemini key, entered on the setup page); the mapping
> server above, which receives only form field labels, types and option texts; boards-api.greenhouse.io (public job
> descriptions and locations); api.smartrecruiters.com and the job site's own public posting API on the form's own
> origin (Workday, Oracle, Dayforce, ADP Workforce Now), sent only the employer and job id from the page address to log
> where the job is. No remote code is loaded.
>
> The optional <all_urls> permission is requested only from the setup page ("Allow on all sites"), for showing the
> banner on employers' own careers sites and for the job loop. The content script runs only on the listed application
> sites, over https.

## Chrome Web Store

**Single purpose:**

> Fill job application forms from the user's own reviewed profile and resume, and keep a log of where they applied.

**Permission justifications:**

- `storage`: keeps the user's profile, resume files, settings, saved answers and application log in the browser.
- `unlimitedStorage`: resume files (several versions, up to a few MB each) and the application log can exceed the
  default 10 MB storage quota.
- `activeTab`: when the user presses the toolbar button, the extension fills the application form on the current tab,
  on sites it has no standing access to.
- `scripting`: injects the form-filling script into the current tab after a toolbar press, and registers the banner
  script for all sites once the user presses "Allow on all sites".
- Host permission `https://worktoday.keikoyoter-ui.workers.dev/*`: the extension's mapping server, which receives form
  field labels (never the user's data) and returns which profile field each one asks for.
- Host permission `https://generativelanguage.googleapis.com/*`: Google Gemini, called with the user's own API key to read
  their resume and answer or draft application questions.
- Content script hosts (Workday, Greenhouse, iCIMS, Oracle, SuccessFactors, Ashby, ADP, Eightfold, Phenom, Lever,
  Dayforce, SmartRecruiters, Tesla careers, Workable, JazzHR, Recruitee, Paylocity, Gem, Breezy HR, Pinpoint, Rippling,
  Teamtailor, BambooHR, Personio, Jobvite, UKG Pro, ADP Workforce Now, Paycom, Freshteam, JobScore, Homerun, Manatal,
  Comeet): shows the Auto-fill banner on these job application sites' application pages.
- Optional host permission `<all_urls>`: requested only when the user presses "Allow on all sites" on the setup page, so
  the banner appears on employers' own careers sites and the job loop can fill the forms a job board opens.

**Remote code:** No, I am not using remote code.

**Data usage (check these):**

- Personally identifiable information (name, email, phone, address, education and work history in the profile).
- Authentication information (an optional job-site password the user saves, typed only into that site's sign-in form).
- Website content (job descriptions and form labels sent to Gemini and the mapping server).

Then certify all three statements: not sold to third parties; not used or transferred for purposes unrelated to the
single purpose; not used to determine creditworthiness or for lending.
