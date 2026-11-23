import { companyFromUrl } from './company';

/** A past application that looks like the job on screen. */
export interface Seen { title: string; company: string; date: string; status: string }

const MAX = 3;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

// Share of the shorter title's words the other has: "SOC Analyst Intern" in "Intern - SOC Analyst - Acme | Workday".
function overlap(a: string, b: string): number {
  const [x, y] = [words(a), words(b)];
  const small = x.size <= y.size ? x : y, big = small === x ? y : x;
  return small.size ? [...small].filter((w) => big.has(w)).length / small.size : 0;
}

// "Cmegroup" (from the address) is "CME Group" (typed in the log); "Acme" is "Acme Corp".
function sameCompany(a: string, b: string): boolean {
  const [x, y] = [squash(a), squash(b)];
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
}

/**
 * Past applications that may be this job, closest first: the same company (a closer title first), or, where the
 * address names no company, a title nearly word for word. The row logged for this very page today is this visit.
 */
export function likelyApplied(pageTitle: string, url: string, today: string,
  logged: Array<{ name: string; url: string; date: string; seen?: string[] }>,
  tracked: Array<{ title: string; company: string; date: string; status?: string; url?: string }>): Seen[] {
  const here = url.split('#')[0]!;
  const company = companyFromUrl(here);
  const visit = (a: { url: string; seen?: string[]; date: string }) => (a.url === here || !!a.seen?.includes(here)) && a.date === today;
  const thisVisit = new Set(logged.filter(visit).map((a) => a.url));
  const copied = new Set(tracked.map((a) => a.url));
  const past: Seen[] = [
    // A logged row copied into the log shows as its copy there, with the status typed in.
    ...logged.filter((a) => !visit(a) && !copied.has(a.url))
      .map((a) => ({ title: a.name, company: companyFromUrl(a.url), date: a.date, status: 'Applied' })),
    ...tracked.filter((a) => !a.url || !thisVisit.has(a.url))
      .map((a) => ({ title: a.title, company: a.company, date: a.date, status: a.status ?? '' })),
  ];
  return past
    .map((p) => ({ p, score: overlap(pageTitle, p.title), same: company ? sameCompany(company, p.company) : false }))
    .filter(({ score, same }) => (company ? same : score >= 0.8))
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, MAX)
    .map(({ p }) => p);
}
