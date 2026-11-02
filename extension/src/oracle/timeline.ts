import type { Profile, WorkEntry, EduEntry } from '../profile/profile';
import { safeClick, setNativeValue, waitFor } from '../fill/dom';
import { MONTH_NAMES } from '../fill/dateParts';
import { fillCombobox } from '../generic/combobox';
import { OR } from './selectors';

const MAX_ENTRIES = 10;

type Editor = HTMLElement;
const named = <T extends HTMLElement>(ed: Editor, name: string) => [...ed.querySelectorAll<T>(`[name="${name}"]`)];

function setText(ed: Editor, name: string, value: string) {
  const el = named<HTMLInputElement | HTMLTextAreaElement>(ed, name)[0];
  if (el && value && !el.value.trim()) setNativeValue(el, value);
}

async function setCombo(ed: Editor, name: string, value: string, timeoutMs: number, fallbacks: string[] = []) {
  const el = named(ed, name)[0];
  if (!el || !value) return;
  // Some sites make a list field free text (live Rockland Trust: Major).
  if (!el.matches('[role="combobox"]')) return setText(ed, name, value);
  for (const v of [value, ...fallbacks]) if ((await fillCombobox(el, v, timeoutMs)) !== 'no_match') return;
}

// A YYYY-MM (or YYYY) date into the editor's Month and Year comboboxes, which share the field's name.
async function setDate(ed: Editor, name: string, value: string, timeoutMs: number) {
  const m = value.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!m) return;
  const [month, year] = named(ed, name);
  if (month && m[2]) await fillCombobox(month, MONTH_NAMES[Number(m[2]) - 1]!, timeoutMs);
  if (year) await fillCombobox(year, m[1]!, timeoutMs);
}

async function fillWork(ed: Editor, w: WorkEntry, timeoutMs: number) {
  setText(ed, 'employerName', w.company);
  setText(ed, 'jobTitle', w.title);
  await setDate(ed, 'startDate', w.startDate, timeoutMs);
  const current = ed.querySelector<HTMLInputElement>(OR.currentJob);
  if (w.current && current && !current.checked) current.click();
  if (!w.current) await setDate(ed, 'endDate', w.endDate, timeoutMs);
  setText(ed, 'employerCity', w.location.split(',')[0]!.trim());
  // Some sites have Achievements in place of Responsibilities (live Rockland Trust).
  setText(ed, named(ed, 'responsibilities').length ? 'responsibilities' : 'achievements', w.description);
}

async function fillEdu(ed: Editor, e: EduEntry, timeoutMs: number) {
  await setCombo(ed, 'contentItemId', e.degree, timeoutMs);
  await setCombo(ed, 'major', e.fieldOfStudy, timeoutMs);
  // The catch-all is "Not Listed/Other" on some sites, "Other/Autre/Otros/…" on others (live Rockland Trust).
  await setCombo(ed, 'educationalEstablishment', e.school, timeoutMs, ['not listed', 'Other/Autre']);
  await setDate(ed, 'startDate', e.startDate, timeoutMs);
  await setDate(ed, 'endDate', e.endDate, timeoutMs);
  setText(ed, 'gpa', e.gpa);
}

/**
 * Oracle's Work and Education History starts empty: each entry is an inline editor opened by an Add button and
 * saved into a timeline tile. Adds the profile entries beyond those already saved. An editor Oracle will not
 * save (a required field it wants is empty) is left open for the applicant, and nothing more is added.
 */
export async function addTimelineEntries(doc: Document, profile: Profile, timeoutMs = 3000): Promise<void> {
  const block = doc.querySelector<HTMLElement>(OR.timeline);
  if (!block) return;
  const kinds = [
    { add: OR.addExperience, tiles: OR.experienceTile, entries: profile.work, fill: (ed: Editor, i: number) => fillWork(ed, profile.work[i]!, timeoutMs) },
    { add: OR.addEducation, tiles: OR.educationTile, entries: profile.education, fill: (ed: Editor, i: number) => fillEdu(ed, profile.education[i]!, timeoutMs) },
  ];
  for (const k of kinds) {
    const count = () => block.querySelectorAll(k.tiles).length;
    for (let i = count(); i < Math.min(k.entries.length, MAX_ENTRIES); i++) {
      const add = block.querySelector<HTMLElement>(k.add);
      if (!add || block.querySelector(OR.editorSave) || !safeClick(add)) return;
      const save = await waitFor(() => block.querySelector<HTMLButtonElement>(OR.editorSave), timeoutMs);
      if (!save) return;
      await k.fill(block, i);
      const before = count();
      // The editor's own Save, as the applicant would press it. It is type="submit" inside the apply form, but
      // Oracle handles it; safeClick would refuse it.
      save.click();
      if (!(await waitFor(() => (count() > before && !block.querySelector(OR.editorSave) ? true : null), timeoutMs))) return;
    }
  }
}
