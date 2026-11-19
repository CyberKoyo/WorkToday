import type { Profile, WorkEntry, EduEntry } from '../profile/profile';
import { safeClick, setNativeValue, waitFor } from '../fill/dom';
import { MONTH_NAMES, today } from '../fill/dateParts';
import { comboboxValue, fillCombobox } from '../generic/combobox';
import { matchOption, norm } from '../fill/matchOption';
import { clean } from '../ats/field';
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

// A YYYY-MM-DD, YYYY-MM or YYYY date into the editor's Month (Day) and Year comboboxes, which share the field's name.
async function setDate(ed: Editor, name: string, value: string, timeoutMs: number) {
  const m = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return;
  const parts = named(ed, name);
  // A license's dates have a Day list between Month and Year (live 2026-11-18): "1".."31".
  const [month, day, year] = parts.length === 3 ? parts : [parts[0], undefined, parts[1]];
  if (month && m[2]) await fillCombobox(month, MONTH_NAMES[Number(m[2]) - 1]!, timeoutMs);
  const d = String(Number(m[3] ?? '1'));
  if (day && m[2]) for (const v of [d, d.padStart(2, '0')]) if ((await fillCombobox(day, v, timeoutMs)) !== 'no_match') break;
  if (year) await fillCombobox(year, m[1]!, timeoutMs);
}

async function fillWork(ed: Editor, w: WorkEntry, country: string, timeoutMs: number) {
  setText(ed, 'employerName', w.company);
  setText(ed, 'jobTitle', w.title);
  await setDate(ed, 'startDate', w.startDate, timeoutMs);
  const current = ed.querySelector<HTMLInputElement>(OR.currentJob);
  if (w.current && current && !current.checked) current.click();
  if (!w.current) await setDate(ed, 'endDate', w.endDate, timeoutMs);
  setText(ed, 'employerCity', w.location.split(',')[0]!.trim());
  await setCombo(ed, 'countryCode', country, timeoutMs); // the applicant's own (live Tenet: Employer Country)
  // Some sites have Achievements in place of Responsibilities (live Rockland Trust).
  setText(ed, named(ed, 'responsibilities').length ? 'responsibilities' : 'achievements', w.description);
}

async function fillEdu(ed: Editor, e: EduEntry, country: string, timeoutMs: number) {
  await setCombo(ed, 'contentItemId', e.degree, timeoutMs);
  await setCombo(ed, 'major', e.fieldOfStudy, timeoutMs);
  // The catch-all is "Not Listed/Other" on some sites, "Other/Autre/Otros/…" on others (live Rockland Trust).
  await setCombo(ed, 'educationalEstablishment', e.school, timeoutMs, ['not listed', 'Other/Autre']);
  await setDate(ed, 'startDate', e.startDate, timeoutMs);
  await setDate(ed, 'endDate', e.endDate, timeoutMs);
  // Live Tenet has this in place of an end date. It is a graduation still to come: Oracle will not save a past one
  // (live: the editor saved once the date was left out).
  if (e.endDate > today().slice(0, e.endDate.length)) await setDate(ed, 'projectedCompletionDate', e.endDate, timeoutMs);
  await setCombo(ed, 'countryCode', country, timeoutMs);
  setText(ed, 'gpa', e.gpa);
  // Some sites ask the degree as a row of buttons, and will not save without one (live Tenet: "Bachelor's Degree
  // (±16 years)"). Last, just before Save: picking the country redraws the editor and dropped an earlier pick.
  const pills = [...ed.querySelectorAll<HTMLElement>(OR.pill)];
  const i = e.degree && !pills.some((p) => p.matches(OR.pillSelected)) ? matchOption(e.degree, pills.map((p) => clean(p.textContent))) : -1;
  if (i !== -1 && safeClick(pills[i]!)) await waitFor(() => (ed.querySelector(OR.pillSelected) ? true : null), timeoutMs);
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
    { add: OR.addExperience, tiles: OR.experienceTile, entries: profile.work, fill: (ed: Editor, i: number) => fillWork(ed, profile.work[i]!, profile.country, timeoutMs) },
    { add: OR.addEducation, tiles: OR.educationTile, entries: profile.education, fill: (ed: Editor, i: number) => fillEdu(ed, profile.education[i]!, profile.country, timeoutMs) },
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

/**
 * The tile layout (live 2026-11-18/19): Experience, Education and Licenses are each a block whose "Add …" button
 * opens an editor that saves into a tile. Saved tiles are known by their text, so a rerun adds no duplicate.
 * `fill` returns false to cancel the entry. An editor Oracle will not save is left open, and nothing more is added.
 */
async function addTiles<T>(doc: Document, label: RegExp, entries: T[], names: (e: T) => string[],
  fill: (ed: Editor, e: T, saved: string) => Promise<boolean>, timeoutMs: number) {
  const first = [...doc.querySelectorAll<HTMLElement>(OR.profileItemsAdd)].find((b) => label.test(b.textContent ?? ''));
  const block = first?.closest<HTMLElement>(OR.profileItems);
  if (!block) return;
  const closed = () => (!block.querySelector(OR.editorSave) ? true : null);
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    const saved = norm(block.textContent ?? ''); // the tiles' text, read while no editor is open
    const keys = names(e).map(norm).filter(Boolean);
    if (!keys.length || keys.every((k) => saved.includes(k))) continue;
    const add = block.querySelector<HTMLElement>(OR.profileItemsAdd);
    if (!add || block.querySelector(OR.editorSave) || !safeClick(add)) return;
    const save = await waitFor(() => block.querySelector<HTMLButtonElement>(OR.editorSave), timeoutMs);
    if (!save) return;
    if (!(await fill(block, e, saved))) {
      // Cancel only closes the editor; like Save, it is type="submit" but Oracle handles it.
      block.querySelector<HTMLButtonElement>(OR.editorCancel)?.click();
      if (!(await waitFor(closed, timeoutMs))) return;
      continue;
    }
    // Found again: the editor can be redrawn while it is filled (live Tenet: Education's Save went unpressed).
    (block.querySelector<HTMLButtonElement>(OR.editorSave) ?? save).click(); // see addTimelineEntries
    if (!(await waitFor(closed, timeoutMs))) return; // Oracle wants more; left open for the applicant
  }
}

/** Experience, Education, and Licenses (searched by name; one the list lacks or already saved is cancelled). */
export async function addProfileTiles(doc: Document, profile: Profile, timeoutMs = 3000): Promise<void> {
  await addTiles(doc, /experience/i, profile.work, (w) => [w.company, w.title], async (ed, w) => { await fillWork(ed, w, profile.country, timeoutMs); return true; }, timeoutMs);
  await addTiles(doc, /education/i, profile.education, (e) => [e.school], async (ed, e) => { await fillEdu(ed, e, profile.country, timeoutMs); return true; }, timeoutMs);
  await addTiles(doc, /licen|certif/i, profile.certifications, (c) => [c.name], async (ed, cert, saved) => {
    const box = named(ed, 'contentItemId')[0];
    const picked = box && (await fillCombobox(box, cert.name, timeoutMs)) === 'filled' ? norm(comboboxValue(box)) : '';
    if (!picked || saved.includes(picked)) {
      console.info('[workday-filler] certification', picked ? 'already saved:' : 'not in the list, cancelled:', JSON.stringify(cert.name));
      return false;
    }
    setText(ed, 'certificationNumber', cert.number);
    await setDate(ed, 'issueDate', cert.issuedDate, timeoutMs);
    await setDate(ed, 'expirationDate', cert.expirationDate, timeoutMs);
    return true;
  }, timeoutMs);
}
