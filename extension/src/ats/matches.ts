// Content-script match patterns per ATS. Plain data so the content script options stay statically readable.
export const MATCHES = {
  workday: ['*://*.myworkdayjobs.com/*', '*://*.myworkday.com/*'],
  greenhouse: ['*://*.greenhouse.io/*'],
  icims: ['*://*.icims.com/*'],
  oracle: ['*://*.oraclecloud.com/hcmUI/CandidateExperience/*'],
  successfactors: ['*://*.successfactors.com/career*', '*://*.successfactors.eu/career*', '*://*.sapsf.com/career*', '*://*.sapsf.eu/career*'],
  ashby: ['*://jobs.ashbyhq.com/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();
