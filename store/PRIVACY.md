# Job Application Filler — Privacy Policy

Last updated: 2026-11-21

Job Application Filler is a browser extension that fills job application forms from a profile you build and review
yourself. This policy says what data the extension handles, where it goes, and why.

## What stays in your browser

Everything you give the extension is kept in the browser's extension storage on your device:

- your profile (name, contact details, address, education, work history, skills, and the answers you choose to enter for
  work authorization, sponsorship, salary, demographic/EEO questions and date of birth);
- the resume files you add;
- your Google Gemini API key;
- answers you type into highlighted fields, saved so the same question can be answered again;
- the log of applications you filled (job title, company, date, link, and the status you set);
- if you save them, a job-site account password and the job loop's sign-in email and password (stored unencrypted);
- a cache of which form labels map to which profile fields.

None of this is sent to the developer. Uninstalling the extension deletes it.

## What leaves your browser, and to whom

**Google Gemini (under your own API key).** To build your profile, your resume files are sent to Google's Gemini API.
When a form asks a question no profile field covers, the question, its answer options and your profile are sent, except
the answers you enter by hand for work authorization, sponsorship, salary, demographic/EEO questions and date of birth,
which are never sent. To draft an answer to an open question ("Why do you want to work here?"), your profile, your
stored resume files, the page title and up to 8,000 characters of the job page's text are sent. These requests go
directly from your browser to Google under your key and are governed by Google's Gemini API terms. On Google's free tier,
Google may use submitted content to improve its products.

**The mapping server (operated by the developer on Cloudflare Workers).** To decide which profile field each form box
wants, the extension sends the form's field labels, field types, section headings and answer option texts. It never
sends your profile values, your resume or anything you typed. Cloudflare processes your IP address to apply a rate
limit. The server keeps no record of requests; if the AI model fails, an error message without the request content is
written to the server's error log.

**Greenhouse's public job API.** On Greenhouse application pages, the extension asks Greenhouse's public API for the job
description. The request contains only the employer's board name and the job id from the page address.

**The job sites you apply to.** When you press Auto-fill (and on the steps it moves to, or while the job loop runs), your profile
values, the answers above and your selected resume file are entered into the application form on that site. A saved
account or loop password is typed only into the sign-in form of a supported application site, over https. The extension
submits an application only if you turn on **Submit applications for me** for the job loop.

## What the extension does not do

- It does not sell or share your data, and it does not use it for advertising, credit or lending decisions, or anything
  unrelated to filling your applications.
- It has no analytics, tracking or telemetry.
- It does not read pages you browse other than to fill application forms there, and it reaches sites beyond the
  supported application sites only when you press its toolbar button or grant the optional "all sites" permission.

## Your choices

You can view and change your profile, resumes, API key and saved passwords on the extension's setup page, and your
application log on its Applications page. Uninstalling the extension removes everything it stored, including saved
answers and the mapping cache.

## Changes

If this policy changes, the new version will be published with an updated date before the extension changes how it
handles data.

## Contact

Questions: [CONTACT EMAIL]
