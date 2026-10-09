import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { IC } from './selectors';
import { discoverFields, extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

// Search, login and job-alert forms sit beside the application and have enough fields to pass for one.
const notApplication = (f: HTMLFormElement) => !!f.querySelector('input[type="password"]')
  || /search|login|signin|sign-in|alert/i.test(`${f.id} ${f.className} ${f.getAttribute('action') ?? ''} ${f.getAttribute('role') ?? ''}`);

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
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // the applicant adds extra work/education rows on iCIMS (README)
};
