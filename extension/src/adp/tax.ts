import type { AtsAdapter } from '../ats/types';
import { clean, type FillResult } from '../ats/field';
import { TX } from './selectors';
import { fillGeneric } from '../generic/fill';
import { setNativeValue, waitFor } from '../fill/dom';

const button = (root: ParentNode, name: RegExp) =>
  [...root.querySelectorAll<HTMLElement>(TX.button)].find((b) => name.test(clean(b.textContent))) ?? null;
const ageGroup = (doc: Document) => doc.querySelector<HTMLElement>(TX.ageGroup);

// The label ends in a screen-reader "required".
function questionText(g: HTMLElement): string {
  const l = g.querySelector(TX.ageLabel)?.cloneNode(true) as HTMLElement | undefined;
  l?.querySelectorAll('.sr-only').forEach((e) => e.remove());
  return clean(l?.textContent);
}

const dobInput = (form: HTMLElement) => form.querySelector(TX.dob)?.shadowRoot?.querySelector('sdf-input')?.shadowRoot?.querySelector('input') ?? null;

/** The birth date as the picker takes it (mm/dd/yyyy), from the profile's YYYY-MM-DD. */
export function fillDob(form: HTMLElement, value: string): FillResult {
  const input = dobInput(form);
  if (!input) return 'error';
  if (input.value) return 'skipped_nonempty';
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const text = iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : value.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return 'no_match';
  input.focus();
  setNativeValue(input, text);
  return 'filled';
}

// After Submit: "Thank you…" and Done, which closes the ADP dialog the screening runs in.
const done = (doc: Document) => button(doc, /^done$/i);

/** Opt Out, then the warning pane's own "Opt out"; the opt-out form follows. On the thank-you page, Done. */
export async function openOptOut(doc: Document, timeoutMs = 10000): Promise<void> {
  if (ageGroup(doc)) return;
  if (done(doc)) { done(doc)!.click(); return; }
  const start = button(doc, /^opt out$/i);
  if (!start) return;
  start.click();
  const confirm = await waitFor(() => {
    const pane = doc.querySelector(TX.confirmPane);
    return pane?.shadowRoot ? button(pane.shadowRoot, /^opt out$/i) : null;
  }, timeoutMs);
  confirm?.click();
  await waitFor(() => ageGroup(doc), timeoutMs);
}

export const adpTax: AtsAdapter = {
  id: 'adp-tax',
  detect: (u) => u.hostname === 'tcs.adp.com',
  isFormPage: (doc) => !!ageGroup(doc) || !!button(doc, /^opt out$/i) || !!done(doc),
  // Opening the opt-out form must not start a second run; the thank-you page starts one that presses Done.
  stepKey: (doc) => (done(doc) ? 'done' : 'opt-out'),
  extract: (doc) => {
    const g = ageGroup(doc);
    if (!g) return [];
    const members = [...g.querySelectorAll<HTMLElement>(TX.radio)];
    const form = g.closest('form') ?? doc.body;
    g.dataset.wfId = 'wf-0';
    return [{
      id: 'wf-0', label: questionText(g), kind: 'radio', required: true, groupIndex: 0,
      container: g, members, options: members.map((m) => m.getAttribute('value') ?? ''), profileKey: 'under40',
    }, {
      // Not on the page until the age is answered "under 40".
      id: 'wf-1', label: 'Date of birth', kind: 'text', required: true, groupIndex: 0,
      container: form, profileKey: 'dateOfBirth', asked: () => !!form.querySelector(TX.dob),
    }];
  },
  fill: async (f, value, timeoutMs, missed) => {
    if (f.profileKey === 'dateOfBirth') return typeof value === 'string' ? fillDob(f.container, value) : 'no_match';
    const r = await fillGeneric(f, value, timeoutMs, missed);
    if (r === 'filled') await new Promise((done) => setTimeout(done, 300)); // the birth date picker shows after the age
    return r;
  },
  fillFile: async () => 'no_match',
  // This Submit sends only the opt-out; the application carries on in the ADP page around the iframe.
  nextButton: (doc) => (ageGroup(doc) ? button(doc, /^submit$/i) : null),
  prepare: openOptOut,
  autoStart: true,
  ensureGroups: async () => {},
};
