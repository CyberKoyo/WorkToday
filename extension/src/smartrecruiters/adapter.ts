import type { AtsAdapter } from '../ats/types';
import { clean, type ExtractedField } from '../ats/field';
import { fillGeneric, fillFileGeneric } from '../generic/fill';

// SmartRecruiters' "oneclick" apply page (live Wellmark, 2026-11-17). Every field is a web component in the page whose
// real input sits in an open shadow root (the phone's is two roots down), so the generic reader sees none of them.
const SR = {
  form: 'oc-oneclick-form',
  // Text boxes carry their label and required flag as attributes on the host.
  field: 'spl-input,spl-textarea,spl-phone-field,oc-resume-upload spl-dropzone',
  title: 'spl-typography-title',
} as const;

const form = (doc: Document) => doc.querySelector<HTMLElement>(SR.form);

/** First match inside the host's shadow tree, however many roots down. */
function deep<T extends HTMLElement>(host: Element, sel: string): T | null {
  const root = host.shadowRoot;
  if (!root) return null;
  const hit = root.querySelector<T>(sel);
  if (hit) return hit;
  for (const el of root.querySelectorAll('*')) { const d = deep<T>(el, sel); if (d) return d; }
  return null;
}

const control = (host: HTMLElement) => deep<HTMLInputElement | HTMLTextAreaElement>(host, 'input:not([role="combobox"]),textarea');
// The field stays the host (highlighting and its clean-up work in the page); the fill goes to the input inside.
const inner = (f: ExtractedField): ExtractedField => ({ ...f, container: control(f.container) ?? f.container });

export const smartrecruiters: AtsAdapter = {
  id: 'smartrecruiters',
  detect: (u) => u.hostname === 'jobs.smartrecruiters.com',
  isFormPage: (doc) => !!form(doc)?.querySelector(SR.field),
  stepKey: (doc) => `${doc.defaultView?.location.pathname ?? ''}|${clean(form(doc)?.querySelector(SR.title)?.textContent)}`,
  extract: (doc) => [...(form(doc)?.querySelectorAll<HTMLElement>(SR.field) ?? [])].flatMap((host, i): ExtractedField[] => {
    const el = control(host);
    if (!el) return [];
    const file = el.matches('input[type="file"]');
    const label = file ? 'Resume' : clean(host.getAttribute('label') ?? el.getAttribute('aria-label'));
    if (!label) return [];
    const id = `wf-${i}`;
    host.dataset.wfId = id;
    const f: ExtractedField = {
      id, label, kind: file ? 'file' : el instanceof HTMLTextAreaElement ? 'textarea' : 'text', groupIndex: 0, container: host,
      required: file || host.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    };
    if (file) f.profileKey = 'resumeFile';
    return [f];
  }),
  fill: (f, value, timeoutMs, missed) => fillGeneric(inner(f), value, timeoutMs, missed),
  fillFile: (f, file) => fillFileGeneric(inner(f), file),
  // shortcut: Experience/Education open an "Add" dialog and the screening step comes after Next; neither seen live
  // (they need a real applicant). Read them once seen.
  ensureGroups: async () => {},
};
