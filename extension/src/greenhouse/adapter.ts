import type { AtsAdapter } from '../ats/types';
import { GH } from './selectors';
import { extractGeneric } from '../generic/extract';
import { fillGeneric, fillFileGeneric, optionsGeneric } from '../generic/fill';
import { growGroups } from '../generic/growGroups';

const form = (doc: Document) => doc.querySelector<HTMLElement>(GH.form);

// The form has no headings around its groups, so name them from the markup ("Education 2" sets groupIndex 1).
function sectionOf(c: HTMLElement): string | undefined {
  const edu = c.closest(GH.educationGroup);
  if (edu) return `Education ${[...c.ownerDocument.querySelectorAll(GH.educationGroup)].indexOf(edu) + 1}`;
  if (c.closest(GH.eeoc)) return 'Voluntary Self-Identification';
  if (c.closest(GH.phone)) return 'Phone';
  return undefined;
}

export const greenhouse: AtsAdapter = {
  id: 'greenhouse',
  detect: (u) => /(^|\.)greenhouse\.io$/.test(u.hostname),
  isFormPage: (doc) => !!form(doc),
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}${doc.defaultView?.location.search ?? ''}`,
  extract: (doc) => { const f = form(doc); return f ? extractGeneric(f, { sectionOf }) : []; },
  fill: fillGeneric,
  options: optionsGeneric,
  fillFile: (f, file) => fillFileGeneric(f, file),
  ensureGroups: async (doc, profile) => {
    const box = doc.querySelector<HTMLElement>(GH.educationContainer);
    if (!box) return;
    await growGroups(() => box.querySelectorAll(GH.educationGroup).length, () => box.querySelector<HTMLElement>(GH.addEducation), profile.education.length);
  },
};
