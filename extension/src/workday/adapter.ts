import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { SEL } from './selectors';
import { extractFields } from './extractFields';
import { ensureRepeatGroups } from './ensureRepeatGroups';
import { fillField, fillFile } from '../fill/fillField';

export const workday: AtsAdapter = {
  id: 'workday',
  detect: (u) => /(^|\.)myworkday(jobs)?\.com$/.test(u.hostname),
  isFormPage: (doc) => !!doc.querySelector(SEL.fieldContainer),
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}|${clean(doc.querySelector(SEL.pageHeader)?.textContent)}`,
  extract: (doc) => extractFields(doc),
  fill: fillField,
  fillFile: (f, file) => fillFile(f, file),
  ensureGroups: (doc, p) => ensureRepeatGroups(doc, p),
};
