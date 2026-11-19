// The company an application is with, read from its address: the ATS's company slug, else the site's own domain.
// shortcut: ATSes that keep the company out of the address (Oracle, ADP, SuccessFactors) give '', so Company stays
// blank to type in; read the page (og:site_name, the posting's header) if that gets tedious.

// Hosts whose path names the company, and which segment: jobs.lever.co/<company>/…, myworkdaysite.com/recruiting/<company>/…
const IN_PATH: Array<[RegExp, number]> = [
  [/(^|\.)greenhouse\.io$/, 0], [/(^|\.)lever\.co$/, 0], [/^jobs\.ashbyhq\.com$/, 0], [/^jobs\.smartrecruiters\.com$/, 0],
  [/(^|\.)myworkday\.com$/, 0], [/(^|\.)myworkdaysite\.com$/, 1], [/^jobs\.dayforcehcm\.com$/, 1],
];
// Hosts that are the company: cmegroup.wd1.myworkdayjobs.com, careers-acme.icims.com, acme.eightfold.ai.
const IN_HOST = /^(?:careers-|jobs-)?([a-z0-9-]+)\.(?:wd\d+\.myworkdayjobs\.com|icims\.com|eightfold\.ai)$/;
const NOWHERE = /(^|\.)(oraclecloud\.com|adp\.com|successfactors\.(com|eu)|sapsf\.com)$/;

// careers.tesla.com → tesla; careers.acme.co.uk → acme.
function ownDomain(host: string): string {
  const labels = host.replace(/^www\./, '').split('.');
  const i = labels.length >= 3 && /^(co|com|org|net|ac)$/.test(labels.at(-2)!) ? labels.length - 3 : labels.length - 2;
  return labels[i] ?? '';
}

const pretty = (slug: string) => decodeURIComponent(slug).replace(/[-_+]+/g, ' ').trim().replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

export function companyFromUrl(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return ''; }
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  // Greenhouse's embedded form: boards.greenhouse.io/embed/job_app?for=<company>
  if (host.endsWith('greenhouse.io') && segs[0] === 'embed') return pretty(u.searchParams.get('for') ?? '');
  const path = IN_PATH.find(([re]) => re.test(host));
  if (path) return pretty(segs[path[1]] ?? '');
  const sub = IN_HOST.exec(host)?.[1];
  if (sub) return pretty(sub);
  return NOWHERE.test(host) ? '' : pretty(ownDomain(host));
}
