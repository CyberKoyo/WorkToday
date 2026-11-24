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
  // Read by the generic reader (src/hosted).
  workable: ['https://apply.workable.com/*'],
  jazzhr: ['https://*.applytojob.com/*'],
  recruitee: ['https://*.recruitee.com/*'],
  paylocity: ['https://recruiting.paylocity.com/*'],
  gem: ['https://jobs.gem.com/*'],
  breezy: ['https://*.breezy.hr/*'],
  pinpoint: ['https://*.pinpointhq.com/*'],
  rippling: ['https://ats.rippling.com/*'],
  teamtailor: ['https://*.teamtailor.com/*'],
  bamboohr: ['https://*.bamboohr.com/careers*'],
  personio: ['https://*.jobs.personio.de/*', 'https://*.jobs.personio.com/*'],
  jobvite: ['https://jobs.jobvite.com/*'],
  ukg: ['https://recruiting.ultipro.com/*', 'https://recruiting2.ultipro.com/*'],
  adpwfn: ['https://workforcenow.adp.com/mascsr/*'],
  paycom: ['https://www.paycomonline.net/v4/ats/*', 'https://paycomonline.net/v4/ats/*'],
  freshteam: ['https://*.freshteam.com/*'],
  jobscore: ['https://careers.jobscore.com/*'],
  homerun: ['https://*.homerun.co/*'],
  manatal: ['https://*.careers-page.com/*', 'https://www.careers-page.com/*'],
  comeet: ['https://www.comeet.co/jobs/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();

/** The supported ATS a frame's address belongs to, read the way the browser reads the patterns above (a "*." host is
 * the domain or any subdomain; the path covers the query too). '' for none, or for a bad address. For the background,
 * which has no adapters to ask. */
export function atsAt(address: string): string {
  let u: URL;
  try { u = new URL(address); } catch { return ''; }
  const fits = (pattern: string) => {
    const [, scheme, any, host, path] = /^(\w+):\/\/(\*\.)?([^/]+)(\/.*)$/.exec(pattern)!;
    const glob = new RegExp(`^${path!.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return u.protocol === `${scheme}:` && (u.hostname === host || (!!any && u.hostname.endsWith(`.${host}`))) && glob.test(u.pathname + u.search);
  };
  return Object.entries(MATCHES).find(([, patterns]) => patterns.some(fits))?.[0] ?? '';
}
