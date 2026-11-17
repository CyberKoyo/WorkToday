import type { AtsAdapter } from '../ats/types';
import { clean } from '../ats/field';
import { SEL } from './selectors';
import { extractFields } from './extractFields';
import { ensureRepeatGroups } from './ensureRepeatGroups';
import { fillField, fillFile } from '../fill/fillField';
import { accountPage, fillAccount } from './account';

export const workday: AtsAdapter = {
  id: 'workday',
  detect: (u) => /(^|\.)myworkday(jobs|site)?\.com$/.test(u.hostname),
  isFormPage: (doc) => !!doc.querySelector(SEL.fieldContainer),
  // Create Account and Sign In share a path and a header; each is its own step.
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}|${clean(doc.querySelector(SEL.pageHeader)?.textContent)}${accountPage(doc) ? `|${accountPage(doc)}` : ''}`,
  extract: (doc) => extractFields(doc),
  fill: fillField,
  fillFile: (f, file) => fillFile(f, file),
  ensureGroups: (doc, p) => ensureRepeatGroups(doc, p),
  accountPage: (doc) => !!accountPage(doc),
  account: (doc, email, password, onAttempt) => fillAccount(doc, email, password, onAttempt),
};
