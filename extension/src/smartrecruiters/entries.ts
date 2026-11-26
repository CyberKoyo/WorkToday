import type { Profile, WorkEntry, EduEntry } from '../profile/profile';
import { pressKey, rawSet, setNativeValue, waitFor } from '../fill/dom';
import { matchOption, norm } from '../fill/matchOption';
import { clean } from '../ats/field';

const MAX_ENTRIES = 10;

/** First match inside the host's shadow tree, however many roots down. */
export function deep<T extends HTMLElement>(host: Element | null, sel: string): T | null {
  const root = host?.shadowRoot;
  if (!root) return null;
  const hit = root.querySelector<T>(sel);
  if (hit) return hit;
  for (const el of root.querySelectorAll('*')) { const d = deep<T>(el, sel); if (d) return d; }
  return null;
}

type Editor = HTMLElement;
const box = (ed: Editor, host: string, sel = 'input,textarea') => deep<HTMLInputElement | HTMLTextAreaElement>(ed.querySelector(host), sel);

function setText(ed: Editor, host: string, value: string) {
  const el = box(ed, host);
  if (el && value && !el.value.trim()) setNativeValue(el, value);
}

// An spl-autocomplete lists the typed text itself first ("#spl-custom-option"), then the site's suggestions; a
// location lists suggestions only (live Wellmark, 2026-11-26). The typed text is kept as written; a location takes
// the suggestion that matches, or is left empty.
async function setAuto(ed: Editor, label: string, value: string, timeoutMs: number) {
  const host = ed.querySelector<HTMLElement>(`spl-autocomplete[label="${label}"]`);
  const el = deep<HTMLInputElement>(host, 'input');
  if (!host?.shadowRoot || !el || !value || el.value.trim()) return;
  el.focus();
  rawSet(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const pick = () => {
    const opts = [...host.shadowRoot!.querySelectorAll<HTMLElement>('spl-select-option')].filter((o) => o.getAttribute('value') !== 'goToManualLocationMode');
    const own = opts.find((o) => o.getAttribute('value') === '#spl-custom-option');
    if (own) return norm(clean(own.textContent)) === norm(value) ? own : null; // once it shows this text, not the last
    const i = matchOption(value, opts.map((o) => clean(o.textContent)));
    return i === -1 ? null : opts[i]!;
  };
  const hit = await waitFor(pick, timeoutMs);
  if (hit) { hit.click(); return; }
  console.warn('[workday-filler] no option for', label, JSON.stringify(value));
  rawSet(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  pressKey(el, 'Escape', 27);
}

// An spl-date-field is a month-and-year picker that takes "MM/YYYY" typed and Enter (live). A YYYY-MM or YYYY date.
function setMonth(ed: Editor, label: string, value: string) {
  const m = value.match(/^(\d{4})(?:-(\d{2}))?/);
  const el = box(ed, `spl-date-field[label="${label}"]:not([disabled])`, 'input.flatpickr-input');
  if (!m || !el || el.value) return;
  el.focus();
  setNativeValue(el, `${m[2] ?? '01'}/${m[1]!}`);
  pressKey(el, 'Enter', 13);
}

async function fillWork(ed: Editor, w: WorkEntry, timeoutMs: number) {
  await setAuto(ed, 'Title', w.title, timeoutMs);
  await setAuto(ed, 'Company', w.company, timeoutMs);
  await setAuto(ed, 'Office location', w.location, timeoutMs);
  setText(ed, 'spl-textarea[label="Description"]', w.description);
  setMonth(ed, 'From', w.startDate);
  const current = [...ed.querySelectorAll('oc-checkbox')].find((c) => /currently/i.test(c.textContent ?? ''));
  const tick = deep<HTMLInputElement>(current?.querySelector('spl-checkbox') ?? null, 'input[type="checkbox"]');
  if (w.current && tick && !tick.checked) tick.click();
  if (!w.current) setMonth(ed, 'To', w.endDate);
}

async function fillEdu(ed: Editor, e: EduEntry, timeoutMs: number) {
  await setAuto(ed, 'Institution', e.school, timeoutMs);
  setText(ed, 'spl-input[label="Major"]', e.fieldOfStudy);
  setText(ed, 'spl-input[label="Degree"]', e.degree);
  // Wellmark's education has no dates (it shows a Connecticut notice instead); another company's may.
  setMonth(ed, 'From', e.startDate);
  setMonth(ed, 'To', e.endDate);
}

/**
 * Experience and Education start empty: each entry is an inline editor opened by "Add" and saved into a card.
 * Adds the profile entries no card shows yet (the resume prefill may have added some). An editor the site will
 * not save (a required field it wants is empty) is left open for the applicant, and nothing more is added.
 */
async function addSection<T>(doc: Document, name: 'experience' | 'education', entries: T[], keys: (e: T) => string[],
  fill: (ed: Editor, e: T) => Promise<void>, timeoutMs: number) {
  const sec = doc.querySelector<HTMLElement>(`oc-${name}`);
  if (!sec) return;
  const editor = () => sec.querySelector<HTMLElement>(`oc-${name}-edit-form`);
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    if (editor()) return; // the applicant's, or one the site would not save
    const saved = norm([...sec.querySelectorAll(`[data-test="${name}-entry"]`)].map((c) => c.textContent).join(' '));
    const k = keys(e).map(norm).filter(Boolean);
    if (!k.length || k.every((x) => saved.includes(x))) continue;
    sec.querySelector<HTMLElement>(`spl-button[aria-label="Add ${name} entry"]`)?.click();
    const ed = await waitFor(editor, timeoutMs);
    if (!ed) return;
    await fill(ed, e);
    sec.querySelector<HTMLElement>(`spl-button[aria-label="Save ${name} entry"]`)?.click();
    if (!(await waitFor(() => (editor() ? null : true), timeoutMs))) return;
  }
}

export async function addEntries(doc: Document, profile: Profile, timeoutMs = 3000): Promise<void> {
  await addSection(doc, 'experience', profile.work, (w) => [w.company, w.title], (ed, w) => fillWork(ed, w, timeoutMs), timeoutMs);
  await addSection(doc, 'education', profile.education, (e) => [e.school], (ed, e) => fillEdu(ed, e, timeoutMs), timeoutMs);
}
