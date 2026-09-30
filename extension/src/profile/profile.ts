import { PROFILE_KEYS, type ProfileKey } from '@wf/shared';

export type ScalarKey = Exclude<ProfileKey, `work.${string}` | `edu.${string}` | 'skills' | 'resumeFile'>;
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
export type Profile = Record<ScalarKey, string> & {
  work: WorkEntry[]; education: EduEntry[]; skills: string[]; reviewed: boolean;
};
export type ProfileValue = string | boolean | string[];

export const emptyWork = (): WorkEntry => ({ title: '', company: '', location: '', startDate: '', endDate: '', current: false, description: '' });
export const emptyEdu = (): EduEntry => ({ school: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', gpa: '' });

export function emptyProfile(): Profile {
  const scalars = Object.fromEntries(SCALAR_KEYS.map((k) => [k, ''])) as Record<ScalarKey, string>;
  return { ...scalars, work: [], education: [], skills: [], reviewed: false };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function normalizeMonth(s: string): string {
  const t = s.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})-(\d{2})$/))) return `${m[1]}-${m[2]}`;
  if ((m = t.match(/^(\d{4})$/))) return m[1];
  if ((m = t.match(/^(\d{1,2})\/(\d{4})$/))) return `${m[2]}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/))) {
    const i = MONTHS.indexOf(m[1]);
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
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
  return p;
}

export function resolveProfileValue(p: Profile, key: ProfileKey, groupIndex: number): ProfileValue | null {
  if (key === 'resumeFile') return null;
  if (key === 'skills') return p.skills.length ? p.skills : null;
  const [group, sub] = key.split('.') as [string, string | undefined];
  if (sub) {
    const list = (group === 'work' ? p.work : p.education) as unknown as Array<Record<string, unknown>>;
    const entry = list[groupIndex];
    if (!entry) return null;
    const v = entry[sub];
    if (typeof v === 'boolean') return v;
    return typeof v === 'string' && v !== '' ? v : null;
  }
  const v = p[key as ScalarKey];
  return v ? v : null;
}
