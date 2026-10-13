import { US_STATES } from './usStates';

const ALIASES: Record<string, string[]> = {
  yes: ['yes', 'y', 'true'],
  no: ['no', 'n', 'false'],
  decline: ["i don't wish to answer", 'i do not wish to answer', 'decline to self identify', 'i decline to self identify',
    'prefer not to say', 'i choose not to disclose', 'decline to answer', 'i prefer not to answer', 'i do not wish to self identify',
    'not declared'],
  'not a veteran': ['i am not a protected veteran', 'i am not a veteran', 'not a protected veteran'],
  // Plural first: "protected veteran" alone also ends "a veteran, just not a protected veteran" (live).
  veteran: ['i identify as one or more of the classifications of protected veterans',
    'i identify as one or more of the classifications of protected veteran', 'protected veteran'],
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

const FILLER = new Set(['and', 'of', 'the', 'in', 'for', 'a', 'an']);

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

function uniqueIndex(opts: string[], pred: (o: string, i: number) => boolean): number {
  const hits = opts.flatMap((o, i) => (pred(o, i) ? [i] : []));
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
  // "VPNs" is the acronym in "Virtual Private Networks (VPNs)".
  const parens = options.map((o) => (o.match(/\(([^)]*)\)/g) ?? []).map(norm));
  for (const c of cands) { const i = uniqueIndex(opts, (_, k) => parens[k]!.includes(c)); if (i !== -1) return i; }
  // "REST APIs" begins "RESTful APIs" word for word.
  for (const c of cands) {
    const vw = c.split(' ');
    if (vw.length < 2) continue;
    const i = uniqueIndex(opts, (o) => { const ow = o.split(' '); return ow.length === vw.length && vw.every((w, k) => ow[k]!.startsWith(w)); });
    if (i !== -1) return i;
  }
  for (const c of cands) { const i = uniqueIndex(opts, (o) => o.startsWith(`${c} `)); if (i !== -1) return i; }
  for (const c of cands) {
    if (c.length < 4) continue; // a 3-letter acronym mid-name (Unisys MCP) is too often another thing
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
  // Filler words would sink "Computer Science" vs "Computer and Information Science" below the cutoff.
  const words = (s: string) => new Set(s.split(' ').filter((t) => !FILLER.has(t)));
  const vt = words(cands[0]!);
  if (!vt.size) return -1;
  let best = -1, bestScore = 0, tie = false;
  opts.forEach((o, i) => {
    const ot = words(o);
    const inter = [...vt].filter((t) => ot.has(t)).length;
    const score = inter / new Set([...vt, ...ot]).size;
    if (score > bestScore) { best = i; bestScore = score; tie = false; }
    else if (score === bestScore && score > 0) tie = true;
  });
  return bestScore >= 0.6 && !tie ? best : -1;
}
