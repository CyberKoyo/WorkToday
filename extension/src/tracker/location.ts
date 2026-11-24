// Where a job is, for the Applications log. Every source below was checked against a live posting (Nov 2026).
// Runs in the content script: the Workday, Oracle, Dayforce and ADP APIs are on the form's own site, and the
// Greenhouse and SmartRecruiters ones are open to any site, so no host permission is needed.
import { greenhouseApi } from '../greenhouse/posting';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const MAX = 300;

/** "Santa Clara", "CA,US", "US" → "Santa Clara, CA, US": repeats and iCIMS' "UNAVAILABLE" placeholders dropped. */
const place = (parts: unknown[]) => [...new Set(parts.flatMap((p) => str(p).split(',')).map((p) => p.trim())
  .filter((p) => p && !/^unavailable$/i.test(p)))].join(', ');
/** Several locations: "Chicago, IL; Atlanta, GA; Remote". */
const places = (locs: unknown[]) => [...new Set(locs.map(str).filter(Boolean))].join('; ');

// schema.org JobPosting (what Google for Jobs reads): Workday, Ashby, Eightfold, JazzHR, iCIMS, Phenom, Lever.
function fromPosting(p: Obj): string {
  const locs = [p.jobLocation].flat().filter(isObj).map((l) => {
    const a = l.address;
    if (!isObj(a)) return str(a) || str(l.name);
    return place([a.addressLocality, a.addressRegion, isObj(a.addressCountry) ? a.addressCountry.name : a.addressCountry]);
  });
  if ([p.jobLocationType].flat().includes('TELECOMMUTE')) locs.push('Remote');
  return places(locs);
}

const postings = (v: unknown): Obj[] => (Array.isArray(v) ? v.flatMap(postings)
  : !isObj(v) ? [] : v['@graph'] ? postings(v['@graph']) : [v['@type']].flat().includes('JobPosting') ? [v] : []);

/** The page's own posting data: JSON-LD, else Phenom's `phApp.ddo` script (its apply page has no JobPosting). */
export function locationInDoc(doc: Document): string {
  const scripts = [...doc.querySelectorAll('script')];
  for (const s of scripts.filter((s) => s.type === 'application/ld+json')) {
    let json: unknown;
    try { json = JSON.parse(s.textContent ?? ''); } catch { continue; }
    const loc = places(postings(json).map(fromPosting));
    if (loc) return loc;
  }
  for (const s of scripts.filter((s) => /phApp\.ddo\s*=/.test(s.textContent ?? ''))) {
    const m = /"jobLocation"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(s.textContent ?? '');
    try { if (m) return str(JSON.parse(m[1]!)); } catch { /* not a JSON string after all */ }
  }
  return '';
}

const getJson = async (f: typeof fetch, url: string): Promise<Obj | null> => {
  const res = await f(url, { headers: { accept: 'application/json' } });
  return res.ok ? (res.json() as Promise<Obj>) : null;
};
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

/** The ATS's own job API, for those that have one the address leads to. '' for any other site. */
async function fromApi(u: URL, f: typeof fetch): Promise<string> {
  const h = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  const after = (name: string) => segs[segs.indexOf(name) + 1] ?? '';

  // Workday: /[en-US/]<site>/job/<location>/<title_req>[/apply…] → /wday/cxs/<tenant>/<site>/job/<location>/<title_req>
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(h);
  if (wd) {
    const j = segs.indexOf('job');
    if (j < 1) return '';
    const end = segs.indexOf('apply', j);
    const d = await getJson(f, `${u.origin}/wday/cxs/${wd[1]}/${segs[j - 1]}/${segs.slice(j, end < 0 ? undefined : end).join('/')}`);
    const i = isObj(d?.jobPostingInfo) ? d.jobPostingInfo : {};
    return places([i.location, ...(Array.isArray(i.additionalLocations) ? i.additionalLocations : []), i.remoteType]);
  }
  const gh = greenhouseApi(u.href);
  if (gh) {
    const d = await getJson(f, gh);
    return isObj(d?.location) ? str(d.location.name) : '';
  }
  // SmartRecruiters: /<company>/<id>-<slug>, or the one-click form /oneclick-ui/company/<company>/publication/<uuid>
  if (h === 'jobs.smartrecruiters.com') {
    const [co, id] = segs[0] === 'oneclick-ui' ? [after('company'), after('publication')] : [segs[0], /^\d+/.exec(segs[1] ?? '')?.[0]];
    if (!co || !id) return '';
    const d = await getJson(f, `https://api.smartrecruiters.com/v1/companies/${co}/postings/${id}`);
    const l = isObj(d?.location) ? d.location : {};
    return places([str(l.fullLocation) || place([l.city, l.region, l.country]), l.remote ? 'Remote' : l.hybrid ? 'Hybrid' : '']);
  }
  // Oracle: /hcmUI/CandidateExperience/<lang>/sites/<site>/job/<id>
  if (/(^|\.)oraclecloud\.com$/.test(h) && segs.includes('sites') && segs.includes('job')) {
    const d = await getJson(f, `${u.origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true`
      + `&finder=ById;Id=%22${encodeURIComponent(after('job'))}%22,siteNumber=${encodeURIComponent(after('sites'))}`);
    const r = arr(d?.items)[0] ?? {};
    return places([r.PrimaryLocation, ...arr(r.secondaryLocations).map((l) => l.Name), r.WorkplaceType]);
  }
  // Dayforce: /[<lang>/]<namespace>/<site>/jobs/<id>; the posting API wants the site's job board id first.
  if (h === 'jobs.dayforcehcm.com') {
    const j = segs.indexOf('jobs');
    if (j < 2 || !segs[j + 1]) return '';
    const [ns, site, lang] = [segs[j - 2], segs[j - 1], j > 2 ? segs[j - 3] : 'en-US'];
    const ctx = await getJson(f, `${u.origin}/api/geo/${ns}/sitecontext/${ns}/${site}/${lang}`);
    if (typeof ctx?.jobBoardId !== 'number') return '';
    const d = await getJson(f, `${u.origin}/api/geo/${ns}/jobposting/${ns}/${lang}/${ctx.jobBoardId}/${segs[j + 1]}`);
    return places([...arr(d?.postingLocations).map((l) => place([l.cityName, l.stateCode]) || str(l.formattedAddress)),
      d?.hasVirtualLocation ? 'Remote' : '']);
  }
  // ADP Workforce Now: recruitment.html?cid=<client>&jobId=<job>
  if (h === 'workforcenow.adp.com' && u.searchParams.get('cid') && u.searchParams.get('jobId')) {
    const d = await getJson(f, `${u.origin}/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions/`
      + `${encodeURIComponent(u.searchParams.get('jobId')!)}?cid=${encodeURIComponent(u.searchParams.get('cid')!)}&lang=en_US`);
    return places(arr(d?.requisitionLocations).map((l) => (isObj(l.nameCode) ? str(l.nameCode.shortName) : '')
      || (isObj(l.address) ? place([l.address.cityName]) : '')));
  }
  return '';
}

/** The posting page a form step was reached from, where the form itself carries no posting data. */
function postingUrl(u: URL): string {
  // iCIMS: /jobs/<id>/<slug>/candidate… → the posting, which sits in the ?in_iframe=1 frame.
  const ic = /(^|\.)icims\.com$/.test(u.hostname) && /^\/jobs\/\d+\/[^/]+\//.exec(u.pathname);
  if (ic) return /\/job$/.test(u.pathname) ? '' : `${u.origin}${ic[0]}job?in_iframe=1`;
  // Lever and the like: /<company>/<id>/apply → /<company>/<id>
  const path = u.pathname.replace(/\/(apply|application)(\/.*)?$/, '');
  return path !== u.pathname && path.split('/').filter(Boolean).length >= 2 ? `${u.origin}${path}` : '';
}

/** Where the job at `url` (the form's page, `doc`) is: the ATS's API, the page's posting data, the posting page's. '' if none says. */
export async function jobLocation(doc: Document, url: string, f: typeof fetch = fetch): Promise<string> {
  let u: URL;
  try { u = new URL(url); } catch { return ''; }
  const tries = [
    () => fromApi(u, f),
    async () => locationInDoc(doc),
    async () => {
      const p = postingUrl(u);
      const res = p ? await f(p) : null;
      return res?.ok ? locationInDoc(new DOMParser().parseFromString(await res.text(), 'text/html')) : '';
    },
  ];
  for (const t of tries) {
    const loc = await t().catch(() => ''); // a site down or changed is no location, never a lost log entry
    if (loc) return loc.slice(0, MAX);
  }
  return '';
}
