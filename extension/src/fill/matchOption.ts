import { US_STATES } from './usStates';
import { matchDegree } from './degree';

const ALIASES: Record<string, string[]> = {
  yes: ['yes', 'y', 'true'],
  no: ['no', 'n', 'false'],
  decline: ["i don't wish to answer", 'i do not wish to answer', 'decline to self identify', 'i decline to self identify',
    'prefer not to say', 'i choose not to disclose', 'decline to answer', 'i prefer not to answer', 'i do not wish to self identify',
    'not declared', 'choose not to specify'],
  'not a veteran': ['i am not a protected veteran', 'i am not a veteran', 'not a protected veteran'],
  // Plural first: "protected veteran" alone also ends "a veteran, just not a protected veteran" (live).
  veteran: ['i identify as one or more of the classifications of protected veterans',
    'i identify as one or more of the classifications of protected veteran', 'protected veteran'],
  // SuccessFactors citizenship lists demonyms with a country code ("American US", live Ericsson).
  'united states': ['united states of america', 'usa', 'american us'],
  'united states of america': ['united states', 'usa', 'american us'],
  usa: ['united states of america', 'united states', 'american us'],
  us: ['united states of america', 'united states', 'american us'],
  uk: ['united kingdom'],
  usd: ['us dollar'], // Oracle currency lists name currencies, not ISO codes (live Rockland Trust)
  mobile: ['mobile phone', 'cell', 'cell phone', 'cellular', 'personal cell', 'personal mobile'], // phone device types
  // Gender lists that name people, not sexes (live Ashby: "Man", "Woman", "Non-binary").
  male: ['man'],
  female: ['woman'],
  'not listed': ['not listed other', 'other not listed', 'other'], // a list's catch-all (live Oracle: "Not Listed/Other")
};

// Degree wordings resumes use → wording Workday degree dropdowns use (normalized, apostrophes dropped).
const DEGREE_ALIASES: Array<[string[], string[]]> = [
  [['bachelors', 'bachelor', 'bs', 'b s', 'bsc', 'b sc', 'ba', 'b a', 'bachelor of science', 'bachelor of arts'], ['bachelors degree', 'bachelors']],
  [['masters', 'master', 'ms', 'm s', 'msc', 'm sc', 'ma', 'm a', 'master of science', 'master of arts'], ['masters degree', 'masters']],
  [['mba', 'm b a', 'master of business administration'], ['m b a', 'mba']],
  [['phd', 'ph d', 'doctorate', 'doctor of philosophy'], ['doctorate degree', 'doctorate', 'phd']],
  [['associates', 'associate', 'aa', 'a a', 'as', 'a s'], ['associates degree', 'associates']],
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
  // "SIEM (Wazuh)" is the skill "SIEM" (live Workday RTX); last, so the full wording still wins.
  const bare = norm(value.replace(/\([^)]*\)/g, ' '));
  if (bare && bare !== v) out.push(bare);
  return [...new Set(out)];
}

// Picks one index from equally good hits, or -1.
type Pick = (hits: number[]) => number;
const onlyOne: Pick = (hits) => (hits.length === 1 ? hits[0]! : -1);

export interface MatchOptions {
  /** 'shortest': among equally good options, take the one shortest without its parentheticals, if only one is. */
  ties?: 'none' | 'shortest';
}

// "3.6" (or "3.60/4.00", "3.6 GPA") is in the option "3.51-3.75".
function inRange(value: string, options: string[]): number {
  const v = value.trim().match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?(?:\s*gpa)?$/i);
  if (!v) return -1;
  const n = Number(v[1]);
  return onlyOne(options.flatMap((o, i) => {
    const t = o.trim();
    const r = t.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
    if (r) return Number(r[1]) <= n && n <= Number(r[2]) ? [i] : [];
    // Open-ended ends of the scale: "3.5 or higher", "Below 2.0" (live Workday RTX).
    const up = t.match(/^(\d+(?:\.\d+)?)\s*(?:\+|or (?:higher|above|more)|and (?:above|up))$/i) ?? t.match(/^(?:above|over)\s+(\d+(?:\.\d+)?)$/i);
    if (up) return n >= Number(up[1]) ? [i] : [];
    const down = t.match(/^(?:below|under|less than)\s+(\d+(?:\.\d+)?)$/i);
    return down && n < Number(down[1]) ? [i] : [];
  }));
}

export function matchOption(value: string, options: string[], { ties = 'none' }: MatchOptions = {}): number {
  // The very wording first: "MA" in a list of state codes is Massachusetts, not a master's.
  const same = options.flatMap((o, i) => (norm(o) === norm(value) ? [i] : []));
  if (same.length === 1) return same[0]!;
  const degree = matchDegree(value, options);
  if (degree !== null) return degree;
  const strict = matchWith(value, options, onlyOne);
  if (strict !== -1) return strict;
  const ranged = inRange(value, options);
  if (ranged !== -1 || ties === 'none') return ranged;
  const len = options.map((o) => norm(o.replace(/\([^)]*\)/g, ' ')).length);
  return matchWith(value, options, (hits) => {
    const min = Math.min(...hits.map((i) => len[i]!));
    const shortest = hits.filter((i) => len[i] === min);
    // "Bash (Scripting Language)" and "Bash (Programming Language)" are one skill under two tags (live Workday RTX).
    // Not "Java (Programming Language)" vs "Java (Island)": only language tags are the same thing.
    const bases = new Set(shortest.map((i) => norm(options[i]!.replace(/\([^)]*\)/g, ' '))));
    const langTags = shortest.every((i) => /\([^)]*\blanguage\)\s*$/i.test(options[i]!));
    return shortest.length === 1 || (bases.size === 1 && langTags) ? shortest[0]! : -1;
  });
}

function matchWith(value: string, rawOptions: string[], pick: Pick): number {
  // Phone country lists end each name in its dial code ("United States+1", live Greenhouse).
  const options = rawOptions.map((o) => o.replace(/\s*\+\d{1,4}\s*$/, ''));
  const uniqueIndex = (opts: string[], pred: (o: string, i: number) => boolean) => pick(opts.flatMap((o, i) => (pred(o, i) ? [i] : [])));
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
  // "Company" stands for the employer's name: "Company Career Website" is "Ericsson Career Site" (live SuccessFactors).
  if (/\bcompany\b/.test(cands[0]!)) {
    // (live Greenhouse: "MongoDB Careers Page")
    const loose = (s: string) => s.replace(/\bcareers?\b/g, 'careers?').replace(/\b(?:web ?site|site)\b/g, '(?:web ?site|site|page)');
    const any = new RegExp(`^${cands[0]!.split(/\bcompany\b/).map(loose).join('.+')}$`);
    const i = uniqueIndex(opts, (o) => any.test(o));
    if (i !== -1) return i;
    // Without a career site, the employer's plain website ("Corewell Health website", live Workday) — never a job board's.
    if (/\bcareers?\b/.test(cands[0]!)) {
      const generic = /\b(?:careers?|job|jobs|board|posting|other|social|internet|diversity|search)\b/;
      const j = uniqueIndex(opts, (o) => { const m = o.match(/^(.+) web ?site$/); return !!m && !generic.test(m[1]!); });
      if (j !== -1) return j;
    }
  }
  // Filler words would sink "Computer Science" vs "Computer and Information Science" below the cutoff.
  const words = (s: string) => new Set(s.split(' ').filter((t) => !FILLER.has(t)));
  const vt = words(cands[0]!);
  if (!vt.size) return -1;
  const scores = opts.map((o) => {
    const ot = words(o);
    const inter = [...vt].filter((t) => ot.has(t)).length;
    return inter / new Set([...vt, ...ot]).size;
  });
  const bestScore = Math.max(...scores);
  return bestScore >= 0.6 ? uniqueIndex(opts, (_, i) => scores[i] === bestScore) : -1;
}
