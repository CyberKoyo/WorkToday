import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField, type FillResult } from '../ats/field';
import { SF } from './selectors';
import { extractGeneric } from '../generic/extract';
import { fillGeneric } from '../generic/fill';
import { safeClick, setFilesViaDataTransfer, waitFor } from '../fill/dom';

const form = (doc: Document) => {
  const f = doc.querySelector<HTMLElement>(SF.form);
  return f?.querySelector(SF.applicationField) ? f : null;
};

const skip = (el: HTMLElement) => el.matches(SF.chrome);

// A picklist's row label is the visible one; its aria-label carries "<br>" from the label's markup as literal text.
function rowLabel(c: HTMLElement): string {
  if (!c.matches(SF.picklist)) return '';
  const l = c.closest('tr')?.querySelector(SF.rowLabel)?.cloneNode(true) as HTMLElement | undefined;
  l?.querySelectorAll('.required').forEach((e) => e.remove());
  return clean(l?.textContent);
}

// The resume slot has no file input of its own; it is offered as one field, already known to be the resume.
function resumeSlot(f: HTMLElement, id: string): ExtractedField | null {
  const slot = [...f.querySelectorAll<HTMLElement>(SF.attachment)]
    .find((s) => /resume|\bcv\b/i.test(s.querySelector(SF.attachmentLabel)?.textContent ?? ''));
  const label = slot?.querySelector(SF.attachmentLabel);
  if (!slot || !label) return null;
  slot.dataset.wfId = id;
  return { id, label: clean(label.textContent), kind: 'file', required: !!label.querySelector('.requiredField'), groupIndex: 0, container: slot, profileKey: 'resumeFile' };
}

/** Opens the slot's upload dialog and hands its file input the resume; choosing the file is the upload. */
export async function attachResume(
  f: ExtractedField, file: File, timeoutMs = 10000, setFiles: (input: HTMLInputElement, file: File) => void = setFilesViaDataTransfer,
): Promise<FillResult> {
  const slot = f.container;
  if (slot.querySelector(SF.attached)) return 'skipped_nonempty';
  const icon = slot.querySelector<HTMLElement>(SF.attachIcon);
  if (!icon) return 'error';
  safeClick(icon);
  const input = await waitFor(() => slot.ownerDocument.querySelector<HTMLInputElement>(SF.uploadInput), Math.min(timeoutMs, 3000));
  if (!input) return 'error';
  try {
    setFiles(input, file);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    console.warn('[workday-filler] file upload failed', e);
    return 'error';
  }
  return (await waitFor(() => slot.querySelector(SF.attached), timeoutMs)) ? 'filled' : 'error';
}

export const successfactors: AtsAdapter = {
  id: 'successfactors',
  detect: (u) => /^career\d+\.(successfactors|sapsf)\.(com|eu)$/.test(u.hostname),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}|${clean(form(doc)?.querySelector(SF.heading)?.textContent)}`,
  extract: (doc) => {
    const f = form(doc);
    if (!f) return [];
    const fields = extractGeneric(f, { skip }).map((x) => ({ ...x, label: rowLabel(x.container) || x.label }));
    const resume = resumeSlot(f, `wf-${fields.length}`);
    return resume ? [...fields, resume] : fields;
  },
  fill: fillGeneric,
  fillFile: (f, file) => attachResume(f, file),
  ensureGroups: async () => {}, // the apply page has no work/education groups
};
