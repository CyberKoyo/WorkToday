import type { AtsAdapter } from '../ats/types';
import { asksIdentity, genericWith } from '../generic/adapter';
import type { Reach } from '../generic/extract';
import { safeClick } from '../fill/dom';

// Hosted application pages the generic reader handles as they are (live captures in test/fixtures, 2026-11-22). Listing
// them makes the banner show by itself, once the form asks who you are (not on job lists or newsletter boxes).
// shortcut: no work/education rows added and no site-specific widgets; give a site its own adapter once one needs it.
const hosted = (id: AtsAdapter['id'], host: RegExp, path = /^/, reach: Reach = {}, extra: Partial<AtsAdapter> = {}): AtsAdapter => ({
  ...genericWith(reach),
  ...extra,
  id,
  detect: (u) => host.test(u.hostname) && path.test(u.pathname),
  isFormPage: (doc) => asksIdentity(doc, reach),
});

// JazzHR hides its file box until "Attach resume" is picked over "Paste resume"; pick it unless the applicant chose already.
async function jazzAttach(doc: Document) {
  const hidden = (id: string) => !!doc.getElementById(id)?.classList.contains('none');
  const pick = doc.getElementById('resumator-choose-upload');
  if (pick && hidden('resumator-resume-upload-wrapper') && hidden('resumator-resume-paste-wrapper')) safeClick(pick);
}

export const HOSTED: AtsAdapter[] = [
  hosted('workable', /^apply\.workable\.com$/),
  hosted('jazzhr', /\.applytojob\.com$/, /^/, {}, { prepare: jazzAttach }),
  hosted('recruitee', /\.recruitee\.com$/),
  hosted('paylocity', /^recruiting\.paylocity\.com$/),
  hosted('gem', /^jobs\.gem\.com$/),
  hosted('breezy', /\.breezy\.hr$/),
  hosted('pinpoint', /\.pinpointhq\.com$/),
  hosted('rippling', /^ats\.rippling\.com$/),
  hosted('teamtailor', /\.teamtailor\.com$/),
  hosted('bamboohr', /\.bamboohr\.com$/, /^\/careers/),
  hosted('personio', /\.jobs\.personio\.(de|com)$/),
  hosted('jobvite', /^jobs\.jobvite\.com$/),
  hosted('ukg', /^recruiting2?\.ultipro\.com$/),
  hosted('adpwfn', /^workforcenow\.adp\.com$/, /^\/mascsr\//),
  hosted('paycom', /^(www\.)?paycomonline\.net$/, /^\/v4\/ats\//, { ariaHidden: true }),
  hosted('freshteam', /\.freshteam\.com$/),
  hosted('jobscore', /^careers\.jobscore\.com$/),
  hosted('homerun', /\.homerun\.co$/),
  hosted('manatal', /(^|\.)careers-page\.com$/),
  // The form is an iframe from comeet.co inside the employer's comeet.com page.
  hosted('comeet', /^www\.comeet\.co$/, /^\/jobs\//),
];
