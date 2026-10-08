import type { FieldKind } from '@wf/shared';
import { SEL } from './selectors';
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

export function extractFields(root: ParentNode = document): ExtractedField[] {
  const out: ExtractedField[] = [];
  root.querySelectorAll<HTMLElement>(SEL.fieldContainer).forEach((container) => {
    if (container.closest('[hidden],[aria-hidden="true"]')) return;
    const kind = detectKind(container);
    if (!kind) return;
    const rawLabel = container.querySelector('legend')?.textContent ?? container.querySelector('label')?.textContent ?? container.getAttribute('aria-label') ?? '';
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
    if (kind === 'radio') {
      field.options = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => radioLabel(container, r));
    }
    out.push(field);
  });
  return out;
}
