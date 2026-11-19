import type { AtsAdapter } from '../ats/types';
import type { ExtractedField } from '../ats/field';
import { extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { comboboxValue } from '../generic/combobox';
import { TEXT_INPUT } from '../fill/dom';

// Class names carry build hashes ("applyFormContainer-23OP4"); only their prefixes and the dropzone class are stable (live ST, 2026-11-04).
const EF = {
  form: '[class*="applyFormContainer"] form',
  resume: '.upload-resume-dropzone input[type="file"]',
} as const;

const form = (doc: Document) => doc.querySelector<HTMLElement>(EF.form);

// The resume box keeps its input at display:none, so the generic pass skips it; it is the one file the form needs.
function resumeField(f: HTMLElement): ExtractedField[] {
  const input = f.querySelector<HTMLInputElement>(EF.resume);
  if (!input) return [];
  const container = input.closest<HTMLElement>('[role="group"],[role="region"]') ?? input.parentElement!;
  container.dataset.wfId = 'wf-resume';
  return [{ id: 'wf-resume', label: 'Resume', kind: 'file', required: false, groupIndex: 0, container, profileKey: 'resumeFile' }];
}

const SETTLE_MS = 300;

// Live ST: a choice picked from a list is dropped when the next field is touched before the list commits it, and a
// text box validated on our blur (before React re-renders) reads empty and shows "cannot be left blank" for good.
const fill: AtsAdapter['fill'] = async (f, value, timeoutMs, missed) => {
  const r = await fillGeneric(f, value, timeoutMs, missed);
  if (r !== 'filled' || (f.kind !== 'select' && f.kind !== 'text' && f.kind !== 'textarea')) return r;
  await new Promise((res) => setTimeout(res, SETTLE_MS));
  if (f.kind === 'select') return comboboxValue(f.container) ? r : 'error';
  const box = f.container.matches(`${TEXT_INPUT},textarea`) ? f.container : f.container.querySelector(`${TEXT_INPUT},textarea`);
  box?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  return r;
};

export const eightfold: AtsAdapter = {
  id: 'eightfold',
  // shortcut: custom career domains are listed one by one (MATCHES.eightfold); add each new one seen live.
  detect: (u) => /(^|\.)eightfold\.ai$/.test(u.hostname) || (u.pathname.startsWith('/careers/apply') && u.searchParams.has('pid')),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}`,
  extract: (doc) => { const f = form(doc); return f ? [...resumeField(f), ...extractGeneric(f)] : []; },
  fill,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // the form seen live has no work/education groups
};
