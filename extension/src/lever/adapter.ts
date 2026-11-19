import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField, type FillResult } from '../ats/field';
import { wrapperField } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { rawSet, waitFor } from '../fill/dom';
import { norm } from '../fill/matchOption';

// Lever's hosted apply page, one page, server-rendered with jQuery (live CesiumAstro, 2026-11-17).
const LV = {
  form: '#application-form',
  // One per field. Card questions keep their label in a div, not a <label>, so the generic reader finds none.
  question: '.application-question',
  label: '.application-label',
  option: '.application-answer-alternative',
  location: 'input.location-input',
  locationResult: '.dropdown-location',
  selectedLocation: '#selected-location',
} as const;

const form = (doc: Document) => doc.querySelector<HTMLElement>(LV.form);
// The disability signature boxes sit in a section jQuery hides until an answer is chosen.
const hidden = (q: HTMLElement) => !!q.closest('[style*="display: none"],[style*="display:none"]');
const optionText = (el: HTMLElement) => clean(el.closest('label')?.querySelector(LV.option)?.textContent) || (el as HTMLInputElement).value;

// The site searches on keydown (500ms debounce) and takes a result on mousedown; a blur while the list is open wipes the box.
async function fillLocation(input: HTMLInputElement, city: string, tieBreak: string | undefined, timeoutMs: number): Promise<FillResult> {
  if (input.value.trim()) return 'skipped_nonempty';
  const doc = input.ownerDocument;
  input.focus();
  rawSet(input, city);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: city.slice(-1), bubbles: true }));
  const results = await waitFor(() => {
    const l = [...doc.querySelectorAll<HTMLElement>(LV.locationResult)];
    return l.length ? l : null;
  }, Math.max(timeoutMs, 4000));
  const named = (results ?? []).filter((r) => norm(r.textContent ?? '').startsWith(norm(city)));
  const t = tieBreak && norm(tieBreak);
  const hit = (t && named.find((r) => ` ${norm(r.textContent ?? '')} `.includes(` ${t} `))) || named[0];
  if (!hit) {
    input.dispatchEvent(new FocusEvent('blur')); // the site's own reset: closes the list and empties the box
    return 'no_match';
  }
  hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  // The resume parse, landing later, overwrites every box that has not had a change event (live Tevora: location wiped).
  for (const el of [input, doc.querySelector(LV.selectedLocation)]) el?.dispatchEvent(new Event('change', { bubbles: true }));
  return 'filled';
}

export const lever: AtsAdapter = {
  id: 'lever',
  detect: (u) => /^jobs\.(eu\.)?lever\.co$/.test(u.hostname),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => doc.defaultView?.location.pathname ?? '',
  extract: (doc) => [...(form(doc)?.querySelectorAll<HTMLElement>(LV.question) ?? [])].flatMap((q) => {
    if (hidden(q)) return [];
    const d = wrapperField(q, (q.querySelector(LV.label)?.textContent ?? '').replace(/✱/g, '*'), optionText);
    if (!d) return [];
    // A lone checkbox's own text is the statement being agreed to; the label above it is the whole legal notice.
    const lone = d.kind === 'checkbox' ? q.querySelector<HTMLElement>('input[type="checkbox"]') : null;
    if (lone && !d.members) d.label = optionText(lone);
    return d.label ? [d] : [];
  }).map((d, i): ExtractedField => {
    const id = `wf-${i}`;
    d.container.dataset.wfId = id;
    const f: ExtractedField = { id, label: d.label, kind: d.kind, required: d.required, groupIndex: 0, container: d.container };
    if (d.options) f.options = d.options;
    if (d.members) f.members = d.members;
    const section = clean(d.container.closest('.section')?.querySelector('h4')?.textContent);
    if (section) f.section = section;
    if (d.container.querySelector(LV.location)) f.profileKey = 'city';
    if (d.kind === 'file' && d.container.querySelector('input[name="resume"]')) f.profileKey = 'resumeFile';
    return f;
  }),
  fill: async (f, value, timeoutMs = 3000, missed) => {
    const loc = f.container.querySelector<HTMLInputElement>(LV.location);
    return loc && typeof value === 'string' ? fillLocation(loc, value, f.tieBreak, timeoutMs) : fillGeneric(f, value, timeoutMs, missed);
  },
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // one page, no work/education groups
};
