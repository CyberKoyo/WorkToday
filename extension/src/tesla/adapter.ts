import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField } from '../ats/field';
import { wrapperField } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

// Tesla's own four-step apply form (live 2026-11-17, step 1 "Personal Information"; class names carry build hashes).
const TS = {
  form: 'form[class*="job-application-form"]',
  // One per field. The file box has two labels ("Resume", and "Select File" on the button); the first names it.
  item: '.tds-form-item',
  label: '.tds-form-label',
  step: '[class*="ApplicationStepEyebrow"]',
} as const;

const form = (doc: Document) => doc.querySelector<HTMLElement>(TS.form);

export const tesla: AtsAdapter = {
  id: 'tesla',
  detect: (u) => u.hostname === 'www.tesla.com' && u.pathname.startsWith('/careers/search/job/'),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => clean(form(doc)?.querySelector(TS.step)?.textContent),
  extract: (doc) => [...(form(doc)?.querySelectorAll<HTMLElement>(TS.item) ?? [])].flatMap((item) => {
    const d = wrapperField(item, item.querySelector(TS.label)?.textContent ?? '');
    return d?.label ? [d] : [];
  }).map((d, i): ExtractedField => {
    const id = `wf-${i}`;
    d.container.dataset.wfId = id;
    const f: ExtractedField = { id, label: d.label, kind: d.kind, required: d.required, groupIndex: 0, container: d.container };
    if (d.options) f.options = d.options;
    if (d.members) f.members = d.members;
    if (d.kind === 'file' && /resume/i.test(d.label)) f.profileKey = 'resumeFile';
    return f;
  }),
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // shortcut: steps 2-4 not seen live (need a real applicant); add growGroups once seen
};
