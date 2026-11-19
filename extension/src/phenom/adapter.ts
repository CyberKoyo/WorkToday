import type { AtsAdapter } from '../ats/types';
import type { ExtractedField } from '../ats/field';
import { extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

// Phenom's own apply flow, on companies' career domains (live STERIS, 2026-11-04): /us/en/apply?jobSeqNo=…&step=1.
const PH = {
  form: '.ph-apply-box form.rjsf',
  resume: 'input[type="file"]',
  resumeButton: '.upload-resume-btn',
} as const;

const form = (doc: Document) => doc.querySelector<HTMLElement>(PH.form);

// The resume input sits at display:none beside its "Upload Resume" button, outside the form.
function resumeField(doc: Document): ExtractedField[] {
  const input = doc.querySelector(PH.resumeButton)?.parentElement?.querySelector<HTMLInputElement>(PH.resume);
  if (!input) return [];
  const container = input.parentElement!;
  container.dataset.wfId = 'wf-resume';
  return [{ id: 'wf-resume', label: 'Resume', kind: 'file', required: false, groupIndex: 0, container, profileKey: 'resumeFile' }];
}

export const phenom: AtsAdapter = {
  id: 'phenom',
  detect: (u) => /\/apply$/.test(u.pathname) && u.searchParams.has('jobSeqNo'),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => doc.defaultView?.location.search ?? '',
  extract: (doc) => { const f = form(doc); return f ? [...resumeField(doc), ...extractGeneric(f)] : []; },
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // shortcut: experience step not seen live (needs a real applicant); add growGroups once seen
};
