// One application seen at several addresses: a company page and its ATS, or one ATS step after another.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// A number standing on its own, maybe after a short prefix ("R0012345", "Intern_35062-1", "8657790-principal-data").
// Not a run inside a longer token: a company's portal hash ("ffa4c5ee7003c56e6918c33281b4ad02") is the same on every job.
const NUMBER = /(?<![a-z0-9])[a-z]{0,2}(\d{5,})(?![a-z0-9])/gi;
// Query parameters that name the job, not the employer or the session (Paycom's clientkey is every job's).
const JOB_PARAM = /job|req|posting|opening|position|opportunit|gh_jid|^pid$|^id$/i;

/** Job ids in the address: UUIDs and stand-alone numbers in the path or in a job parameter. */
export function jobIds(url: string): Set<string> {
  const u = new URL(url);
  const text = [u.pathname, ...[...u.searchParams].filter(([k]) => JOB_PARAM.test(k)).map(([, v]) => v)].join(' ');
  const ids = new Set((text.match(UUID) ?? []).map((s) => s.toLowerCase()));
  for (const m of text.replace(UUID, ' ').matchAll(NUMBER)) ids.add(m[1]!);
  return ids;
}

const place = (url: string) => { const u = new URL(url); return `${u.host}${u.pathname.replace(/\/+$/, '')}`; };

/** The same job: a shared job id; or, where neither address has one, the same site with one path inside the other. */
export function sameJob(a: string, b: string): boolean {
  const [x, y] = [jobIds(a), jobIds(b)];
  if (x.size && y.size) return [...x].some((id) => y.has(id));
  const [p, q] = [place(a), place(b)];
  return p === q || p.startsWith(`${q}/`) || q.startsWith(`${p}/`);
}
