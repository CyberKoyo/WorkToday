import type { FieldKind } from '@wf/shared';
import { SEL, FIELD_KEYS } from './selectors';
import { clean, type ExtractedField } from '../ats/field';

export { clean, toDescriptor, type ExtractedField } from '../ats/field';

function detectKind(c: HTMLElement): FieldKind | null {
  if (c.querySelector(SEL.fileInput)) return 'file';
  if (c.querySelector(SEL.dateMonth) || c.querySelector(SEL.dateYear)) return 'date';
  if (c.querySelector(SEL.dropdownButton)) return 'select';
  if (c.querySelector('input[type="radio"]')) return 'radio';
  if (c.querySelector('input[type="checkbox"]')) return 'checkbox';
  if (c.querySelector('textarea')) return 'textarea';
  if (c.querySelector(SEL.textInput)) return 'text';
  return null;
}

function radioLabel(c: HTMLElement, r: HTMLInputElement): string {
  const byFor = r.id ? c.querySelector(`label[for="${r.id.replace(/"/g, '\\"')}"]`) : null;
  return clean((byFor ?? r.closest('label'))?.textContent);
}

function sectionOf(c: HTMLElement): string | undefined {
  const g = c.parentElement?.closest<HTMLElement>(SEL.group);
  if (!g) return undefined;
  const ref = g.getAttribute('aria-labelledby');
  const h = (ref && c.ownerDocument.getElementById(ref)) || g.querySelector('h2,h3,h4');
  return clean(h?.textContent) || undefined;
}

// A Workday application's upload box is its Resume/CV section unless its label names another document.
const OTHER_DOCUMENT = /cover|transcript|letter|certificat|portfolio/i;

// The widest box around a control that holds no other field: the upload's file list or the checkbox's sentence comes with it.
function boxOf(el: HTMLElement): HTMLElement {
  let c = el.parentElement ?? el;
  for (let p = c.parentElement, up = 0; p && up < 4 && p !== el.ownerDocument.body && !p.querySelector(SEL.fieldContainer)
    && p.querySelectorAll('input:not([type="hidden"]),textarea,select,button[aria-haspopup]').length === 1; p = p.parentElement, up++) c = p;
  return c;
}

export function extractFields(root: ParentNode = document): ExtractedField[] {
  const out: ExtractedField[] = [];
  root.querySelectorAll<HTMLElement>(SEL.fieldContainer).forEach((container) => {
    if (container.closest('[hidden],[aria-hidden="true"]')) return;
    const kind = detectKind(container);
    if (!kind) return;
    const rawLabel = (container.querySelector('legend')?.textContent ?? container.querySelector('label')?.textContent ?? container.getAttribute('aria-label'))
      || (kind === 'file' ? sectionOf(container) ?? 'Resume/CV' : ''); // a drop zone has no label of its own
    const label = clean(rawLabel);
    if (!label) return;
    const id = `wf-${out.length}`;
    container.dataset.wfId = id;
    const section = sectionOf(container);
    const m = section?.match(/(\d+)\s*$/);
    const field: ExtractedField = {
      id, label, kind,
      required: rawLabel.includes('*') || !!container.querySelector('[aria-required="true"],[required]'),
      groupIndex: m ? Number(m[1]) - 1 : 0,
      container,
    };
    if (section) field.section = section;
    const key = FIELD_KEYS[container.dataset.automationId!.slice('formField-'.length)];
    if (key) field.profileKey = key;
    else if (kind === 'file' && !OTHER_DOCUMENT.test(label)) field.profileKey = 'resumeFile'; // "Upload a file" names nothing the mapper can place
    if (kind === 'radio') {
      field.options = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => radioLabel(container, r));
    }
    out.push(field);
  });
  // shortcut: guarded against markup not yet seen live. Some tenants may draw the resume drop zone and the agreement
  // boxes outside any formField box, where the loop above cannot see them; confirm on a live page, then tighten or drop.
  const doc = (root as Node).ownerDocument ?? (root as Document);
  root.querySelectorAll<HTMLInputElement>('input[type="file"],input[type="checkbox"]').forEach((el) => {
    if (el.closest(SEL.fieldContainer) || el.parentElement?.closest('[hidden],[aria-hidden="true"]')) return;
    const container = boxOf(el);
    const file = el.type === 'file';
    const lab = (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    const rawLabel = file ? sectionOf(container) ?? 'Resume/CV' : lab?.textContent ?? el.getAttribute('aria-label') ?? '';
    const label = clean(rawLabel);
    if (!label || out.some((f) => f.container === container)) return;
    const id = `wf-${out.length}`;
    container.dataset.wfId = id;
    const field: ExtractedField = {
      id, label, kind: file ? 'file' : 'checkbox', groupIndex: 0, container,
      required: rawLabel.includes('*') || el.matches('[aria-required="true"],[required]'),
    };
    if (file && !OTHER_DOCUMENT.test(label)) field.profileKey = 'resumeFile';
    out.push(field);
  });
  return out;
}
