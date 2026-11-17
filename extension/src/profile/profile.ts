import { PROFILE_KEYS, type ProfileKey } from '@wf/shared';

export type ScalarKey = Exclude<ProfileKey, `work.${string}` | `edu.${string}` | `cert.${string}` | 'skills' | 'resumeFile'>;
export const SCALAR_KEYS = PROFILE_KEYS.filter(
  (k) => !k.includes('.') && k !== 'skills' && k !== 'resumeFile',
) as ScalarKey[];

export interface WorkEntry {
  title: string; company: string; location: string;
  startDate: string; endDate: string; current: boolean; description: string;
}
export interface EduEntry {
  school: string; degree: string; fieldOfStudy: string; startDate: string; endDate: string; gpa: string;
}
export interface CertEntry {
  name: string; number: string; issuedDate: string; expirationDate: string;
}
export type Profile = Record<ScalarKey, string> & {
  work: WorkEntry[]; education: EduEntry[]; certifications: CertEntry[]; skills: string[]; reviewed: boolean;
};
export type ProfileValue = string | boolean | string[];

export const emptyWork = (): WorkEntry => ({ title: '', company: '', location: '', startDate: '', endDate: '', current: false, description: '' });
export const emptyEdu = (): EduEntry => ({ school: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', gpa: '' });
export const emptyCert = (): CertEntry => ({ name: '', number: '', issuedDate: '', expirationDate: '' });

export function emptyProfile(): Profile {
  const scalars = Object.fromEntries(SCALAR_KEYS.map((k) => [k, ''])) as Record<ScalarKey, string>;
  return { ...scalars, work: [], education: [], certifications: [], skills: [], reviewed: false };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function normalizeMonth(s: string): string {
  const t = s.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/))) return `${m[1]!}-${m[2]!}`;
  if ((m = t.match(/^(\d{4})$/))) return m[1]!;
  if ((m = t.match(/^(\d{1,2})\/(\d{4})$/))) return `${m[2]!}-${m[1]!.padStart(2, '0')}`;
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/))) {
    const i = MONTHS.indexOf(m[1]!);
    if (i >= 0) return `${m[2]!}-${String(i + 1).padStart(2, '0')}`;
  }
  return '';
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const objs = (v: unknown) =>
  (Array.isArray(v) ? v : []).map(obj).filter((e): e is Record<string, unknown> => !!e);

export function normalizeProfile(raw: unknown): Profile {
  const r = obj(raw);
  const p = emptyProfile();
  if (!r) return p;
  for (const k of SCALAR_KEYS) p[k] = str(r[k]);
  p.skills = Array.isArray(r.skills) ? r.skills.map(str).filter(Boolean) : [];
  p.work = objs(r.work).map((e) => {
    const endRaw = str(e.endDate);
    return {
      title: str(e.title), company: str(e.company), location: str(e.location),
      startDate: normalizeMonth(str(e.startDate)), endDate: normalizeMonth(endRaw),
      current: e.current === true || /^(present|current|now)$/i.test(endRaw),
      description: str(e.description),
    };
  });
  p.education = objs(r.education).map((e) => ({
    school: str(e.school), degree: str(e.degree), fieldOfStudy: str(e.fieldOfStudy),
    startDate: normalizeMonth(str(e.startDate)), endDate: normalizeMonth(str(e.endDate)), gpa: str(e.gpa),
  }));
  p.certifications = objs(r.certifications).map((e) => ({
    name: str(e.name), number: str(e.number),
    issuedDate: normalizeMonth(str(e.issuedDate)), expirationDate: normalizeMonth(str(e.expirationDate)),
  }));
  return p;
}

export function resolveProfileValue(p: Profile, key: ProfileKey, groupIndex: number): ProfileValue | null {
  if (key === 'resumeFile') return null;
  if (key === 'skills') return p.skills.length ? p.skills : null;
  const [group, sub] = key.split('.') as [string, string | undefined];
  if (sub) {
    const list = (group === 'work' ? p.work : group === 'cert' ? p.certifications : p.education) as unknown as Array<Record<string, unknown>>;
    const entry = list[groupIndex];
    if (!entry) return null;
    const v = entry[sub];
    if (typeof v === 'boolean') return v;
    return typeof v === 'string' && v !== '' ? v : null;
  }
  const v = p[key as ScalarKey];
  return v ? v : null;
}

// Standard yes/no questions, known by their wording; the mapper tends to miss or misplace them (live UL Solutions, PwC).
const STANDARD: Array<[ScalarKey, RegExp]> = [
  ['over18', /\b(18|eighteen)\b.*\b(years?|age|older)\b|\bat least (18|eighteen)\b/i],
  ['backgroundCheckConsent', /\bbackground (check|screen(ing)?|investigation)\b/i],
  ['relatedToEmployee', /\brelated to\b.*\b(employees?|works?|working|employed)\b|\b(family|relatives?)\b.*\b(work(s|ing)?|employed)\b/i],
  // Defense contractors ask both (live RTX); one answer covers "CURRENT ..." and "FORMER ... employee?".
  ['usCitizen', /\bcitizen of the (u\.?\s?s\.?a?|united states)\b|\b(u\.?\s?s\.?|united states|american) citizen\b/i],
  ['governmentEmployee', /\b(federal|government)\b.*\b(civilian|military)\b.*\bemployee\b/i],
  // "by / at / here": "Have you ever worked with Python?" is not about this company.
  ['previouslyEmployed', /\b(previously|ever|formerly|before)\b.*\b(employed|worked|intern(ship|ed)?)\b.*\b(by|at|here|for us)\b|\bformer (employee|intern)\b|\b(previously|ever|formerly)\b.*\b(an? )?(employee|intern|contractor) (of|at|with)\b/i],
  // "worked for" a named company (Workday: "Have you previously worked for Acme?"), not "for a government agency".
  ['previouslyEmployed', /\b(?:[Pp]reviously|[Ee]ver|[Ff]ormerly)\b.*\bworked for (?:[Tt]he )?[A-Z]|\bworked for (?:[Tt]he )?[A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*)* (?:before|previously)\b/],
];
export const standardKey = (label: string): ScalarKey | null => STANDARD.find(([, re]) => re.test(label))?.[0] ?? null;

// A yes/no answer goes only where the question is about it: the mapper can send "Are you a CURRENT U.S. federal
// government ... employee?" to one of these and answer it Yes (live RTX).
const YES_NO_TOPIC: Partial<Record<ScalarKey, RegExp>> = {
  workAuthorized: /authori[sz]|eligib|legally|permit|right to work/i,
  requiresSponsorship: /sponsor|visa|h-?1b|immigration/i,
  over18: /\b(18|eighteen)\b|\bage\b|\bminor\b/i,
  under40: /\b(40|forty)\b|\bage\b/i,
  willingToRelocate: /relocat|\bmove\b/i,
  previouslyEmployed: /\b(previous(ly)?|former(ly)?|ever|before|past)\b.*\b(employ|work|intern)/i,
  relatedToEmployee: /relat|family|relative|spouse/i,
  backgroundCheckConsent: /background|screen|check/i,
  usCitizen: /citizen/i,
  governmentEmployee: /\b(federal|government|military)\b/i,
};
/** The mapper's key, unless it is a yes/no key the question is not about. */
export const plausibleKey = (key: ProfileKey | null, label: string): ProfileKey | null =>
  key && YES_NO_TOPIC[key as ScalarKey] && !YES_NO_TOPIC[key as ScalarKey]!.test(label) ? null : key;

// A yes/no "are you Hispanic or Latino?" question (not a race/ethnicity list that includes it), answered from the ethnicity.
export const asksHispanicYesNo = (label: string) => /hispanic|latin[oa]/i.test(label) && !/\b(race|ethnic\w*)\b/i.test(label);
/** The races to tick in a check-all-that-apply list: the races setting, else a single-race ethnicity. */
export function racesAnswer(p: Profile): string[] | null {
  const list = p.races.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list;
  const e = p.ethnicity.trim().toLowerCase();
  return !e || /hispanic|latin|two or more/.test(e) ? null : [e];
}
export const asksRaces = (label: string) => /\b(races?|racial)\b/i.test(label); // live Ashby: "your racial or ethnic background"

export const hispanicAnswer = (ethnicity: string) =>
  /^decline$/i.test(ethnicity) ? 'decline' : /hispanic|latin[oa]/i.test(ethnicity) ? 'Yes' : 'No';
