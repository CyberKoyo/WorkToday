import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField } from '../ats/field';
import { AS } from './selectors';
import { discoverFields, type Discovered } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

const entries = (doc: Document) => [...doc.querySelectorAll<HTMLElement>(`${AS.form} ${AS.entry}`)]
  .filter((e) => !e.parentElement?.closest(AS.entry));

// Every question has a title label; the generic labels would be an option ("LinkedIn") or a placeholder ("Start typing...").
function question(e: HTMLElement): Discovered | null {
  const title = e.querySelector(AS.title);
  const label = clean(title?.textContent);
  const required = !!title?.matches('[class*="required" i]');
  const yesno = e.querySelector(AS.yesno);
  if (yesno) {
    const members = [...yesno.querySelectorAll<HTMLElement>(AS.yesnoOption)];
    return { container: e, label, kind: 'radio', required, options: members.map((b) => clean(b.textContent)), members };
  }
  const found = discoverFields(e);
  const first = found[0];
  if (!first) return null;
  // Each box of a checkbox group is named after its own option, so the generic pass sees one field per box.
  if (found.length > 1 && found.every((d) => d.kind === 'checkbox')) {
    const members = found.map((d) => (d.container.matches('input') ? d.container : d.container.querySelector<HTMLElement>('input[type="checkbox"]')!));
    return { container: e, label, kind: 'checkbox', required, options: found.map((d) => d.label), members };
  }
  // A lone checkbox's own text is the statement being agreed to; keep it.
  return { ...first, label: (first.kind !== 'checkbox' && label) || first.label, required: first.required || required };
}

// Removing a file in Ashby's box leaves it in the input's FileList, so the box's own text says whether one is attached.
export const fileShown = (input: HTMLInputElement) =>
  [...(input.closest(AS.entry) ?? input).querySelectorAll('button')].some((b) => AS.replaceButton.test(b.textContent ?? ''));

export const ashby: AtsAdapter = {
  id: 'ashby',
  detect: (u) => u.hostname === 'jobs.ashbyhq.com',
  isFormPage: (doc) => !!doc.querySelector(AS.form),
  stepKey: (doc) => doc.defaultView?.location.pathname ?? '',
  extract: (doc) => entries(doc).flatMap((e) => {
    const d = question(e);
    if (!d?.label) return [];
    // The name box takes the whole name; runAutofill knows that from "Full Name".
    if (e.dataset.fieldPath === '_systemfield_name' && !/\bfull\b/i.test(d.label)) d.label = `Full ${d.label}`;
    return [d];
  }).map((d, i): ExtractedField => {
    const id = `wf-${i}`;
    d.container.dataset.wfId = id;
    const f: ExtractedField = { id, label: d.label, kind: d.kind, required: d.required, groupIndex: 0, container: d.container };
    if (d.options) f.options = d.options;
    if (d.members) f.members = d.members;
    if (d.container.closest<HTMLElement>(AS.entry)?.dataset.fieldPath === '_systemfield_location') f.profileKey = 'city';
    return f;
  }),
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file, undefined, fileShown),
  ensureGroups: async () => {}, // no work/education groups
};
