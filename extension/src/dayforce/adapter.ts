import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField } from '../ats/field';
import { extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { waitFor } from '../fill/dom';

// Dayforce's candidate portal, "Apply without an Account" (live Performance Contracting, 2026-11-17). Ant Design form.
const DF = {
  root: 'main',
  field: '[id^="jobPostingApplication_"]',
  // Kept at display:none behind the "Import Resume" button; the id appears twice (top banner and Resume Upload).
  resume: '#jobPostingApplication_files_resume',
  // An Ant select shows its choice here; its search input stays empty.
  chosen: '.ant-select-selection-item',
  // The attached file's row, under Resume Upload.
  attached: '[test-id="upload-file-item-test"]',
  step: 'h1',
} as const;

const IMPORT_MS = 15000;
const QUIET_POLLS = 30; // waitFor polls every 50ms: 1.5s with no change

const root = (doc: Document) => doc.querySelector<HTMLElement>(DF.root);

function resumeField(r: HTMLElement): ExtractedField[] {
  const input = r.querySelector<HTMLInputElement>(DF.resume);
  if (!input) return [];
  const container = input.parentElement!;
  container.dataset.wfId = 'wf-resume';
  return [{ id: 'wf-resume', label: 'Resume', kind: 'file', required: false, groupIndex: 0, container, profileKey: 'resumeFile' }];
}

export const dayforce: AtsAdapter = {
  id: 'dayforce',
  detect: (u) => u.hostname === 'jobs.dayforcehcm.com',
  isFormPage: (doc) => !!root(doc)?.querySelector(DF.field),
  // The page's first h1 is the job title; the step's own name is the last.
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}|${clean([...(root(doc)?.querySelectorAll(DF.step) ?? [])].at(-1)?.textContent)}`,
  // State/Province is disabled until Country is chosen, so it is read on the next press of Auto-fill.
  extract: (doc) => { const r = root(doc); return r ? [...resumeField(r), ...extractGeneric(r)] : []; },
  fill: async (f, value, timeoutMs, missed) =>
    (f.kind === 'select' && f.container.querySelector(DF.chosen) ? 'skipped_nonempty' : fillGeneric(f, value, timeoutMs, missed)),
  // Attaching imports the resume: the site parses it, saves what it read as employment entries and rewrites the
  // personal fields (live: values filled before it landed were wiped). So wait for the form to stop changing.
  fillFile: async (f, file) => {
    const doc = f.container.ownerDocument;
    const r = await fillFileGeneric(f, file, undefined, () => !!doc.querySelector(DF.attached));
    if (r !== 'filled') return r;
    await waitFor(() => (doc.querySelector(DF.attached) ? true : null), IMPORT_MS);
    let last = -1;
    let same = 0;
    await waitFor(() => {
      const size = root(doc)?.innerHTML.length ?? 0;
      same = size === last ? same + 1 : 0;
      last = size;
      return same >= QUIET_POLLS ? true : null;
    }, IMPORT_MS);
    return r;
  },
  // shortcut: the import closes the education/employment editors (employment comes back saved from the resume;
  // education did not, live). Add the "Add …"/Update loop (as oracle/timeline does) for what the import misses.
  ensureGroups: async () => {},
};
