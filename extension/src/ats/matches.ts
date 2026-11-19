// Content-script match patterns per ATS. Plain data so the content script options stay statically readable.
export const MATCHES = {
  workday: ['*://*.myworkdayjobs.com/*', '*://*.myworkday.com/*', '*://*.myworkdaysite.com/*'],
  greenhouse: ['*://*.greenhouse.io/*'],
  icims: ['*://*.icims.com/*'],
  oracle: ['*://*.oraclecloud.com/hcmUI/CandidateExperience/*'],
  successfactors: ['*://*.successfactors.com/career*', '*://*.successfactors.eu/career*', '*://*.sapsf.com/career*', '*://*.sapsf.eu/career*'],
  ashby: ['*://jobs.ashbyhq.com/*'],
  adp: ['*://recruiting.adp.com/*', '*://recruiting2.adp.com/*'],
  adpTax: ['*://tcs.adp.com/*'],
  // Eightfold also runs on companies' own career domains.
  eightfold: ['*://*.eightfold.ai/careers*', '*://careers.qualcomm.com/careers*'],
  // Phenom runs only on companies' own career domains; shortcut: listed as seen live, add new ones the same way.
  phenom: ['*://careers.steris.com/*/apply*', '*://jobs.cvshealth.com/*/apply*'],
  lever: ['*://jobs.lever.co/*', '*://jobs.eu.lever.co/*'],
  dayforce: ['*://jobs.dayforcehcm.com/*'],
  smartrecruiters: ['*://jobs.smartrecruiters.com/*'],
  // The job page opens the form in place, so the script must already be there.
  tesla: ['*://www.tesla.com/careers/search/job/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();
