// Content-script match patterns per ATS. Plain data so the content script options stay statically readable.
// https only: on a cleartext page a network attacker writes the document the profile and password go into.
export const MATCHES = {
  workday: ['https://*.myworkdayjobs.com/*', 'https://*.myworkday.com/*', 'https://*.myworkdaysite.com/*'],
  greenhouse: ['https://*.greenhouse.io/*'],
  icims: ['https://*.icims.com/*'],
  oracle: ['https://*.oraclecloud.com/hcmUI/CandidateExperience/*'],
  successfactors: ['https://*.successfactors.com/career*', 'https://*.successfactors.eu/career*', 'https://*.sapsf.com/career*', 'https://*.sapsf.eu/career*'],
  ashby: ['https://jobs.ashbyhq.com/*'],
  adp: ['https://recruiting.adp.com/*', 'https://recruiting2.adp.com/*'],
  adpTax: ['https://tcs.adp.com/*'],
  // Eightfold also runs on companies' own career domains.
  eightfold: ['https://*.eightfold.ai/careers*', 'https://careers.qualcomm.com/careers*'],
  // Phenom runs only on companies' own career domains; shortcut: listed as seen live, add new ones the same way.
  phenom: ['https://careers.steris.com/*/apply*', 'https://jobs.cvshealth.com/*/apply*'],
  lever: ['https://jobs.lever.co/*', 'https://jobs.eu.lever.co/*'],
  dayforce: ['https://jobs.dayforcehcm.com/*'],
  smartrecruiters: ['https://jobs.smartrecruiters.com/*'],
  // The job page opens the form in place, so the script must already be there.
  tesla: ['https://www.tesla.com/careers/search/job/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();
