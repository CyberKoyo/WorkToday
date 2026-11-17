import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { IC } from './selectors';
import { discoverFields, extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { adaptForLabel } from '../fill/dateParts';
import { ajaxWidget, fillAjaxSelect } from './dropdown';
import { notApplication } from '../generic/adapter';

const widget = (el: HTMLElement) => el.matches(IC.widgetChrome);

function formRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(IC.form)
    ?? [...doc.forms].find((f) => !notApplication(f) && discoverFields(f, widget).length >= 2) ?? null;
}

export const icims: AtsAdapter = {
  id: 'icims',
  detect: (u) => /(^|\.)icims\.com$/.test(u.hostname),
  isFormPage: (doc) => { const f = formRoot(doc); return !!f && discoverFields(f, widget).length > 0; },
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}|${clean(formRoot(doc)?.querySelector(IC.heading)?.textContent)}`,
  extract: (doc) => { const f = formRoot(doc); return f ? extractGeneric(f, { skip: widget }) : []; },
  fill: (f, value, timeoutMs, missed) => {
    const sel = f.kind === 'select' ? (f.container.matches('select') ? f.container as HTMLSelectElement : f.container.querySelector('select')) : null;
    const widget = sel && ajaxWidget(sel);
    if (!sel || !widget || typeof value !== 'string') return fillGeneric(f, value, timeoutMs, missed);
    return fillAjaxSelect(sel, widget, adaptForLabel(f.label, value), timeoutMs);
  },
  // A resume already on file shows its name in a hidden input; uploading again would re-parse over the form.
  fillFile: (f, file) => (f.container.closest(IC.resumeRow)?.querySelector<HTMLInputElement>(IC.resumeFileName)?.value
    ? Promise.resolve('skipped_nonempty') : fillFileGeneric(f, file)),
  resumeReloadsPage: true, // the file input's onchange submits the form with uploadResume=1
  ensureGroups: async () => {}, // the applicant adds extra work/education rows on iCIMS (README)
};
