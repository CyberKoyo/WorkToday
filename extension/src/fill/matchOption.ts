import { US_STATES } from './usStates';

const ALIASES: Record<string, string[]> = {
  yes: ['yes', 'y', 'true'],
  no: ['no', 'n', 'false'],
  decline: ["i don't wish to answer", 'i do not wish to answer', 'decline to self identify', 'i decline to self identify',
    'prefer not to say', 'i choose not to disclose', 'decline to answer', 'i prefer not to answer'],
  'not a veteran': ['i am not a protected veteran', 'i am not a veteran', 'not a protected veteran'],
  veteran: ['i identify as one or more of the classifications of protected veteran', 'protected veteran'],
  'united states': ['united states of america', 'usa'],
  usa: ['united states of america', 'united states'],
  us: ['united states of america', 'united states'],
  uk: ['united kingdom'],
};

// Degree wordings resumes use → wording Workday degree dropdowns use (normalized, apostrophes dropped).
const DEGREE_ALIASES: Array<[string[], string[]]> = [
  [['bachelors', 'bachelor', 'bs', 'b s', 'bsc', 'b sc', 'ba', 'b a', 'bachelor of science', 'bachelor of arts'], ['bachelors degree']],
  [['masters', 'master', 'ms', 'm s', 'msc', 'm sc', 'ma', 'm a', 'master of science', 'master of arts'], ['masters degree']],
  [['mba', 'm b a', 'master of business administration'], ['m b a', 'mba']],
  [['phd', 'ph d', 'doctorate', 'doctor of philosophy'], ['doctorate degree', 'doctorate', 'phd']],
  [['associates', 'associate', 'aa', 'a a', 'as', 'a s'], ['associates degree']],
];
for (const [from, to] of DEGREE_ALIASES) for (const k of from) ALIASES[k] = [...(ALIASES[k] ?? []), ...to];

export function norm(s: string): string {
  return s.toLowerCase().replace(/['’‘]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function candidatesFor(value: string): string[] {
  const v = norm(value);
  if (!v) return [];
  const out = [v, ...(ALIASES[v] ?? []).map(norm)];
  const full = US_STATES[v.toUpperCase()];
  if (full) out.push(norm(full));
  const abbr = Object.entries(US_STATES).find(([, name]) => norm(name) === v)?.[0];
  if (abbr) out.push(abbr.toLowerCase());
  return [...new Set(out)];
}

function uniqueIndex(opts: string[], pred: (o: string) => boolean): number {
  const hits = opts.flatMap((o, i) => (pred(o) ? [i] : []));
  return hits.length === 1 ? hits[0]! : -1;
}

export function matchOption(value: string, options: string[]): number {
  const opts = options.map(norm);
  const cands = candidatesFor(value);
  if (!cands.length || !opts.length) return -1;
  for (const c of cands) { const i = opts.indexOf(c); if (i !== -1) return i; }
  // "Python (Programming Language)" is an exact "Python" — unless two options share that base.
  const bases = options.map((o) => norm(o.replace(/\([^)]*\)/g, ' ')));
  for (const c of cands) { const i = uniqueIndex(bases, (b) => b === c); if (i !== -1) return i; }
  for (const c of cands) { const i = uniqueIndex(opts, (o) => o.startsWith(`${c} `)); if (i !== -1) return i; }
  for (const c of cands) {
    if (c.length < 3) continue;
    const i = uniqueIndex(opts, (o) => ` ${o} `.includes(` ${c} `));
    if (i !== -1) return i;
  }
  // A single punctuated term (TCP/IP, Node.js, CI/CD) may be spelled joined up in the options (TCPIP, NodeJS).
  const raw = value.trim();
  if (!/\s/.test(raw) && /[^a-z0-9]/i.test(raw)) {
    const joined = (s: string) => norm(s).replace(/ /g, '');
    const v = joined(raw);
    const js = options.map(joined);
    let i = uniqueIndex(js, (o) => o === v);
    if (i === -1 && v.length >= 4) i = uniqueIndex(js, (o) => o.startsWith(v));
    if (i !== -1) return i;
  }
  const vt = new Set(cands[0]!.split(' '));
  let best = -1, bestScore = 0, tie = false;
  opts.forEach((o, i) => {
    const ot = new Set(o.split(' '));
    const inter = [...vt].filter((t) => ot.has(t)).length;
    const score = inter / new Set([...vt, ...ot]).size;
    if (score > bestScore) { best = i; bestScore = score; tie = false; }
    else if (score === bestScore && score > 0) tie = true;
  });
  return bestScore >= 0.6 && !tie ? best : -1;
}
