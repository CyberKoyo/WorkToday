import { SCALAR_KEYS, emptyEdu, emptyWork, type EduEntry, type Profile, type ScalarKey, type WorkEntry } from '../profile/profile';

export const FIELD_LABELS: Record<ScalarKey, string> = {
  firstName: 'First name', lastName: 'Last name', preferredName: 'Preferred name', email: 'Email', phone: 'Phone',
  addressLine1: 'Address line 1', addressLine2: 'Address line 2', city: 'City', state: 'State / province',
  postalCode: 'Postal code', country: 'Country', linkedinUrl: 'LinkedIn URL', websiteUrl: 'Website', githubUrl: 'GitHub URL',
  workAuthorized: 'Legally authorized to work in this country?', requiresSponsorship: 'Will require visa sponsorship?',
  willingToRelocate: 'Willing to relocate?', desiredSalary: 'Desired salary', earliestStartDate: 'Earliest start date',
  referralSource: 'How did you hear about jobs (default answer)', gender: 'Gender', ethnicity: 'Race / ethnicity',
  races: 'Races, comma-separated, for check-all-that-apply lists (e.g. asian, white)',
  veteranStatus: 'Veteran status', disabilityStatus: 'Disability status',
  over18: '18 or older?', previouslyEmployed: 'Previously worked or interned at the company? (default answer)',
  relatedToEmployee: 'Related to a current employee? (default answer)', backgroundCheckConsent: 'Consent to a background check?',
};

const YN = ['', 'yes', 'no'];
export const CHOICES: Partial<Record<ScalarKey, string[]>> = {
  workAuthorized: YN, requiresSponsorship: YN, willingToRelocate: YN,
  over18: YN, previouslyEmployed: YN, relatedToEmployee: YN, backgroundCheckConsent: YN,
  gender: ['', 'male', 'female', 'non-binary', 'decline'],
  ethnicity: ['', 'hispanic or latino', 'white', 'black or african american', 'asian', 'american indian or alaska native',
    'native hawaiian or other pacific islander', 'two or more races', 'decline'],
  veteranStatus: ['', 'not a veteran', 'veteran', 'decline'],
  disabilityStatus: ['', 'no', 'yes', 'decline'],
};

const WORK_FIELDS: Array<keyof WorkEntry> = ['title', 'company', 'location', 'startDate', 'endDate', 'current', 'description'];
const EDU_FIELDS: Array<keyof EduEntry> = ['school', 'degree', 'fieldOfStudy', 'startDate', 'endDate', 'gpa'];
type Entry = Record<string, string | boolean>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Node[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

const row = (labelText: string, control: HTMLElement) =>
  el('label', { className: 'row' }, el('span', { textContent: labelText }), control);

function scalarControl(key: ScalarKey, value: string): HTMLElement {
  const choices = CHOICES[key];
  const c: HTMLInputElement | HTMLSelectElement = choices ? el('select') : el('input', { type: 'text' });
  if (choices) for (const v of choices) c.append(el('option', { value: v, textContent: v || '— not set —' }));
  c.value = value;
  c.dataset.key = key;
  return c;
}

function entryBlock(fields: string[], entry: Entry): HTMLElement {
  const box = el('div', { className: 'entry' });
  for (const f of fields) {
    const v = entry[f];
    const c: HTMLElement = typeof v === 'boolean'
      ? el('input', { type: 'checkbox', checked: v })
      : f === 'description' ? el('textarea', { value: String(v ?? '') }) : el('input', { type: 'text', value: String(v ?? '') });
    c.dataset.entryKey = f;
    box.append(row(f, c));
  }
  const rm = el('button', { type: 'button', textContent: 'Remove' });
  rm.dataset.remove = '';
  rm.onclick = () => box.remove();
  box.append(rm);
  return box;
}

function listSection(list: 'work' | 'education', title: string, fields: string[], entries: object[], blank: () => object) {
  const wrap = el('div');
  wrap.dataset.list = list;
  for (const e of entries) wrap.append(entryBlock(fields, e as Entry));
  const add = el('button', { type: 'button', textContent: `Add ${title.toLowerCase()}` });
  add.dataset.add = list;
  add.onclick = () => wrap.append(entryBlock(fields, blank() as Entry));
  return el('fieldset', {}, el('legend', { textContent: title }), wrap, add);
}

export function renderProfileForm(root: HTMLElement, p: Profile): void {
  root.replaceChildren();
  const about = el('fieldset', {}, el('legend', { textContent: 'About you' }));
  for (const k of SCALAR_KEYS) about.append(row(FIELD_LABELS[k], scalarControl(k, p[k])));
  const skills = el('input', { type: 'text', value: p.skills.join(', ') });
  skills.dataset.key = 'skills';
  root.append(
    about,
    listSection('work', 'Work experience', WORK_FIELDS, p.work, emptyWork),
    listSection('education', 'Education', EDU_FIELDS, p.education, emptyEdu),
    row('Skills (comma separated)', skills),
  );
}

function readEntries<T>(root: HTMLElement, list: string): T[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-list="${list}"] .entry`)].map((box) => {
    const out: Entry = {};
    box.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-entry-key]').forEach((c) => {
      out[c.dataset.entryKey!] = c instanceof HTMLInputElement && c.type === 'checkbox' ? c.checked : c.value.trim();
    });
    return out as T;
  });
}

export function readProfileForm(root: HTMLElement): Omit<Profile, 'reviewed'> {
  const scalars = Object.fromEntries(SCALAR_KEYS.map((k) => {
    const c = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${k}"]`);
    return [k, (c?.value ?? '').trim()];
  })) as Record<ScalarKey, string>;
  const skillsRaw = root.querySelector<HTMLInputElement>('[data-key="skills"]')?.value ?? '';
  return {
    ...scalars,
    work: readEntries<WorkEntry>(root, 'work'),
    education: readEntries<EduEntry>(root, 'education'),
    skills: skillsRaw.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
