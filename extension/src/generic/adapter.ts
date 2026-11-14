import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { discoverFields, extractGeneric, type Skip } from './extract';
import { fillGeneric, fillFileGeneric } from './fill';

// Search, login and job-alert forms sit beside the application and have enough fields to pass for one.
export const notApplication = (f: HTMLFormElement) => !!f.querySelector('input[type="password"]')
  || /search|login|signin|sign-in|alert/i.test(`${f.id} ${f.className} ${f.getAttribute('action') ?? ''} ${f.getAttribute('role') ?? ''}`);

const inSideForm: Skip = (el) => { const f = el.closest('form'); return !!f && notApplication(f); };

/** The form holding most of the page's fields; the whole page when they live outside any one form. */
export function applicationRoot(doc: Document): HTMLElement {
  const total = discoverFields(doc.body, inSideForm).length;
  let best: HTMLFormElement | null = null;
  let bestCount = 0;
  for (const f of doc.forms) {
    if (notApplication(f)) continue;
    const n = discoverFields(f).length;
    if (n > bestCount) { best = f; bestCount = n; }
  }
  return best && bestCount >= 2 && bestCount * 2 >= total ? best : doc.body;
}

const path = (doc: Document) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}`;

// Any other site, started from the toolbar button. Never picked by URL, so detect matches nothing.
export const generic: AtsAdapter = {
  id: 'generic',
  detect: () => false,
  isFormPage: (doc) => discoverFields(applicationRoot(doc), inSideForm).length > 0,
  stepKey: (doc) => `${path(doc)}|${clean(applicationRoot(doc).querySelector('h1, h2, [role="heading"]')?.textContent)}`,
  extract: (doc) => extractGeneric(applicationRoot(doc), { skip: inSideForm }),
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async () => {}, // no known "Add" button; the applicant adds extra rows, then presses Auto-fill again
};
