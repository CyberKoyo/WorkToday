import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField, type FillResult } from '../ats/field';
import { AD } from './selectors';
import { discoverFields, headingBefore } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { adaptForLabel } from '../fill/dateParts';
import { matchOption } from '../fill/matchOption';
import { waitFor } from '../fill/dom';
import { shown } from '../autofill/advance';

type Question = Omit<ExtractedField, 'id' | 'groupIndex'>;

const pane = (doc: Document) => doc.querySelector<HTMLElement>(AD.component);

function labelText(l: Element): string {
  const copy = l.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`${AD.note},input,.dijit`).forEach((e) => e.remove());
  // Long questions wrap with <br> ("…for any employer<br>in the United States?").
  copy.querySelectorAll('br').forEach((e) => e.replaceWith(' '));
  return clean(copy.textContent);
}

// EEO: the Hispanic and race groups share one fieldset; gender, veteran and disability are asked only by the section heading.
function radioGroups(e: HTMLElement): Question[] {
  const byName = new Map<string, HTMLInputElement[]>();
  for (const r of e.querySelectorAll<HTMLInputElement>(AD.radio)) {
    // The race list keeps "Hispanic or Latino" and "Not Hispanic or Latino" hidden; ADP sets them from the question above.
    if (r.closest('label')?.style.display === 'none') continue;
    byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  }
  return [...byName.values()].map((members) => {
    let asked = members[0]!.closest('label')?.previousElementSibling ?? null;
    while (asked && !asked.matches(`${AD.ask},label`)) asked = asked.previousElementSibling;
    return {
      label: (asked?.matches(AD.ask) && clean(asked.textContent)) || headingBefore(members[0]!) || '',
      kind: 'radio' as const,
      required: true, // live: "Either Self-Identify or Decline to Identify."
      container: members[0]!.closest('fieldset')!,
      options: members.map((r) => clean(r.closest('label')?.querySelector(AD.option)?.textContent)),
      members,
    };
  });
}

// The label is the question; the generic pass can't pair it with a widget it isn't tied to.
function question(e: HTMLElement): Question[] {
  if (e.closest(AD.sourceParked)) return [];
  if (e.querySelector(AD.radio)) return radioGroups(e);
  // The AI opt-out has a label of only help text before the checkbox's own.
  const l = [...e.querySelectorAll(AD.label)].find((x) => labelText(x));
  if (!l) return [];
  const asked = l.querySelector(AD.questionText);
  const label = (asked && labelText(asked)) || labelText(l);
  // The consent box marks its own text instead ("Reviewed").
  const required = l.matches('.required') || !!l.querySelector('.required');
  const select = e.querySelector<HTMLElement>(AD.select);
  if (select) return [{ label, kind: 'select', required, container: select, ...(e.matches(AD.source) && { profileKey: 'referralSource' as const }) }];
  const box = e.querySelector<HTMLElement>(AD.textBox);
  if (box) return [{ label, kind: 'text', required, container: box }];
  if (e.querySelector(AD.checkbox)) return [{ label, kind: 'checkbox', required, container: e, ...(e.querySelector(AD.consent) && { answer: true }) }];
  // Screening answers: a textarea or a native (multi-)select, tied to no label.
  const area = e.querySelector<HTMLElement>('textarea');
  if (area) return [{ label, kind: 'textarea', required, container: area }];
  const list = e.querySelector<HTMLSelectElement>('select');
  if (list) return [{ label, kind: 'select', required, container: list, options: [...list.options].filter((o) => o.value !== '').map((o) => clean(o.text)) }];
  const d = discoverFields(e, undefined, true)[0]; // a row shows once an earlier answer lands: asked() checks it
  if (!d) return [];
  const q: Question = { label, kind: d.kind, required: required || d.required, container: d.container };
  if (d.options) q.options = d.options;
  if (d.members) q.members = d.members;
  return [q];
}

// The shown choice starts with a zero-width space.
const choice = (t: HTMLElement) => clean(t.querySelector(AD.selectShown)?.textContent?.replace(/\u200b/g, ''));
const toggle = (t: HTMLElement) => t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const rowText = (r: HTMLElement) => clean(r.querySelector(AD.menuLabel)?.textContent);

export async function fillSelect(t: HTMLElement, text: string, timeoutMs = 3000): Promise<FillResult> {
  const now = choice(t);
  if (now && !AD.placeholder.test(now)) return 'skipped_nonempty';
  const rows = () => [...t.ownerDocument.querySelectorAll<HTMLElement>(`[id="${t.id}_menu"] ${AD.menuItem}`)]
    .filter((r) => !AD.placeholder.test(rowText(r)));
  toggle(t);
  if (!(await waitFor(() => (rows().length ? true : null), timeoutMs))) return 'error';
  const list = rows();
  const i = matchOption(text, list.map(rowText));
  if (i === -1) { toggle(t); return 'no_match'; } // and close it again
  const pick = rowText(list[i]!);
  list[i]!.click();
  return (await waitFor(() => (choice(t) === pick ? true : null), timeoutMs)) ? 'filled' : 'error';
}

// Documents step: Resume (required) and Cover Letter boxes; an untitled "additional document" box is left out.
const documents = (pane: HTMLElement): Question[] => [...pane.querySelectorAll<HTMLElement>(AD.docBox)].flatMap((box) => {
  const label = clean(box.querySelector(AD.docTitle)?.textContent);
  if (!label) return [];
  const required = !!box.closest('.appPanel')?.querySelector(AD.docRequired);
  return [{ label, kind: 'file' as const, required, container: box, ...(/resume|\bcv\b/i.test(label) && { profileKey: 'resumeFile' as const }) }];
});

/** Choosing the file is the upload; it counts once the box shows its check. */
export async function attachDocument(
  f: ExtractedField, file: File, timeoutMs = 15000, setFiles?: (input: HTMLInputElement, file: File) => void,
): Promise<FillResult> {
  const attached = () => (f.container.querySelector(AD.docAttached) ? true : null);
  const r = await fillFileGeneric(f, file, setFiles, () => !!attached());
  if (r !== 'filled') return r;
  return (await waitFor(attached, timeoutMs)) ? 'filled' : 'error';
}

export const adp: AtsAdapter = {
  id: 'adp',
  detect: (u) => /^recruiting\d*\.adp\.com$/.test(u.hostname),
  isFormPage: (doc) => !!pane(doc)?.querySelector(AD.element),
  // The steps load into one page; each has its own component id.
  // The Application Form step has sections of its own (Personal Information, Employment History…), each under its h3.
  stepKey: (doc) => `${pane(doc)?.id ?? ''}|${clean(doc.querySelector(AD.activeStep)?.textContent)}|${clean(pane(doc)?.querySelector('h3')?.textContent)}`,
  extract: (doc) => {
    const p = pane(doc);
    if (!p) return [];
    return [...[...p.querySelectorAll<HTMLElement>(AD.element)].flatMap(question), ...documents(p)].map((q, i) => {
      const id = `wf-${i}`;
      q.container.dataset.wfId = id;
      const row = q.container.closest<HTMLElement>(AD.questionRow);
      return { ...q, id, groupIndex: 0, ...(row && { asked: () => row.style.display !== 'none' }) };
    });
  },
  fill: async (f, value, timeoutMs, missed) => {
    if (f.container.matches(AD.select) && typeof value === 'string') return fillSelect(f.container, adaptForLabel(f.label, value), timeoutMs);
    const r = await fillGeneric(f, value, timeoutMs, missed);
    // dijit reports the answer on a timer; the next screening question shows after it.
    if (f.asked && r === 'filled') await new Promise((done) => setTimeout(done, 300));
    return r;
  },
  fillFile: (f, file) => attachDocument(f, file),
  // The last step's arrow sends the application.
  nextButton: (doc) => {
    const last = [...doc.querySelectorAll(AD.step)].at(-1);
    if (!last || last.matches('.active')) return null;
    return [...doc.querySelectorAll<HTMLElement>(AD.next)].find(shown) ?? null;
  },
  ensureGroups: async () => {}, // until a captured step shows work/education groups
};
