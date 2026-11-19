import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { OR } from './selectors';
import { discoverFields, extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric } from '../generic/fill';
import { addProfileTiles, addTimelineEntries } from './timeline';

const path = (doc: Document) => doc.defaultView?.location.pathname ?? '';

function formRoot(doc: Document): HTMLElement | null {
  if (!/\/apply(\/|$)/.test(path(doc))) return null;
  return doc.querySelector<HTMLElement>(OR.root) ?? doc.body;
}

export const oracle: AtsAdapter = {
  id: 'oracle',
  detect: (u) => /(^|\.)oraclecloud\.com$/.test(u.hostname) && u.pathname.includes('/hcmUI/CandidateExperience/'),
  isFormPage: (doc) => { const r = formRoot(doc); return !!r && discoverFields(r).length > 0; },
  stepKey: (doc) => `${path(doc)}|${clean(formRoot(doc)?.querySelector(OR.heading)?.textContent)}`,
  extract: (doc) => { const r = formRoot(doc); return r ? extractGeneric(r) : []; },
  fill: fillGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async (doc, p) => { await addTimelineEntries(doc, p); await addProfileTiles(doc, p); },
};
