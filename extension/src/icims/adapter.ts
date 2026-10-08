import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { IC } from './selectors';
import { discoverFields, extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

const isSearch = (f: HTMLFormElement) => /search/i.test(`${f.id} ${f.className} ${f.getAttribute('action') ?? ''} ${f.getAttribute('role') ?? ''}`);

function formRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(IC.form)
    ?? [...doc.forms].find((f) => !isSearch(f) && discoverFields(f).length >= 2) ?? null;
}

export const icims: AtsAdapter = {
  id: 'icims',
  detect: (u) => /(^|\.)icims\.com$/.test(u.hostname),
  isFormPage: (doc) => { const f = formRoot(doc); return !!f && discoverFields(f).length > 0; },
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}|${clean(formRoot(doc)?.querySelector(IC.heading)?.textContent)}`,
  extract: (doc) => { const f = formRoot(doc); return f ? extractGeneric(f) : []; },
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // the applicant adds extra work/education rows on iCIMS (README)
};
