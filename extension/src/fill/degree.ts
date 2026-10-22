// Degrees are spelled every which way ("BS", "B.S.", "Bachelor's", "Bachelors of Science", "Bachelor of Science (BS)",
// "4 Year Degree"), by resumes and by option lists alike. Both sides are read as a level plus, when they say one, a kind.
type Level = 'hs' | 'associate' | 'bachelor' | 'master' | 'mba' | 'doctorate' | 'jd' | 'md';
interface Degree { level: Level; kind: string | null }

const ACRONYMS: Record<string, Degree> = {
  ged: { level: 'hs', kind: null },
  aa: { level: 'associate', kind: 'arts' }, as: { level: 'associate', kind: 'science' }, aas: { level: 'associate', kind: 'science' },
  ba: { level: 'bachelor', kind: 'arts' }, bfa: { level: 'bachelor', kind: 'arts' }, bba: { level: 'bachelor', kind: 'business' },
  bs: { level: 'bachelor', kind: 'science' }, bsc: { level: 'bachelor', kind: 'science' }, bse: { level: 'bachelor', kind: 'science' },
  bsn: { level: 'bachelor', kind: 'science' }, beng: { level: 'bachelor', kind: 'engineering' },
  ma: { level: 'master', kind: 'arts' }, mfa: { level: 'master', kind: 'arts' },
  ms: { level: 'master', kind: 'science' }, msc: { level: 'master', kind: 'science' }, mse: { level: 'master', kind: 'science' },
  msn: { level: 'master', kind: 'science' }, meng: { level: 'master', kind: 'engineering' },
  mba: { level: 'mba', kind: null }, phd: { level: 'doctorate', kind: null }, dphil: { level: 'doctorate', kind: null },
  jd: { level: 'jd', kind: null }, md: { level: 'md', kind: null },
};

// First hit wins: "Master of Business Administration" is an MBA before it is a master's.
const LEVELS: Array<[RegExp, Level]> = [
  [/\b(high school|secondary school|ged)\b/, 'hs'],
  [/\bjuris\b/, 'jd'],
  [/\bdoctor of medicine\b/, 'md'],
  [/\bmaster of business administration\b/, 'mba'],
  [/\b(doctorate|doctoral|doctor)\b/, 'doctorate'],
  [/\b(masters?|graduate)\b/, 'master'],
  [/\b(bachelors?|baccalaureate|undergraduate|4 year|four year)\b/, 'bachelor'],
  [/\b(associates?|2 year|two year)\b/, 'associate'],
];
const KINDS = ['science', 'arts', 'engineering', 'business'];

// Apostrophes dropped, punctuated acronyms closed up: "B.S." → "bs", "Ph.D." → "phd", "M.B.A." → "mba".
function squash(s: string): string {
  return s.toLowerCase().replace(/['’‘]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b(?:[a-z] )+[a-z]\b/g, (m) => m.replace(/ /g, '')).replace(/\bph d\b/g, 'phd');
}

export function parseDegree(text: string): Degree | null {
  const s = squash(text);
  if (!s) return null;
  const words = s.split(' ');
  // An acronym leads ("BS Computer Science") or trails ("Doctorate (PhD)"); mid-sentence "as" or "ma" is a word.
  const acr = ACRONYMS[words[0]!] ?? ACRONYMS[words.at(-1)!];
  if (acr) return acr;
  const level = LEVELS.find(([re]) => re.test(s))?.[1];
  if (!level) return null;
  // The kind is named before the field: "Bachelor of Arts in Computer Science" is an arts degree.
  const head = s.split(' in ')[0]!;
  return { level, kind: KINDS.find((k) => new RegExp(`\\b${k}\\b`).test(head)) ?? null };
}

/**
 * The option holding the same degree as `value`: same level, then the same kind or else the generic one
 * ("Bachelor's Degree"). -1 when that is unclear; null when `value` or the options are not degrees.
 */
export function matchDegree(value: string, options: string[]): number | null {
  const v = parseDegree(value);
  if (!v) return null;
  const parsed = options.map(parseDegree);
  if (!parsed.some(Boolean)) return null;
  const pick = (want: Degree): number => {
    const same = parsed.flatMap((d, i) => (d?.level === want.level ? [i] : []));
    // A site with no MBA option lists it as a master's.
    if (!same.length) return want.level === 'mba' ? pick({ level: 'master', kind: 'business' }) : -1;
    const ofKind = want.kind ? same.filter((i) => parsed[i]!.kind === want.kind) : [];
    const generic = same.filter((i) => !parsed[i]!.kind);
    for (const group of [ofKind, generic]) {
      if (group.length === 1) return group[0]!;
      if (group.length > 1) {
        const len = group.map((i) => squash(options[i]!).length);
        const min = Math.min(...len);
        return len.filter((l) => l === min).length === 1 ? group[len.indexOf(min)]! : -1;
      }
    }
    // Asked for no kind and only one of this level is offered: that is it, whatever its kind.
    return !want.kind && same.length === 1 ? same[0]! : -1;
  };
  return pick(v);
}
