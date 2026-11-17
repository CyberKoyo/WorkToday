import type { FieldKind, ProfileKey } from '@wf/shared';
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

// A bare "Name" is unsafe for the mapper. Number first: "Certification Number" also says certification.
function certKey(label: string, kind: FieldKind): ProfileKey | undefined {
  if (kind === 'file') return 'cert.proof';
  if (/\b(number|no\.?|id)\b|#/i.test(label)) return 'cert.number';
  if (/\bissued?\b|\bobtained\b|\bearned\b/i.test(label)) return 'cert.issuedDate';
  if (/\bexpir|\bvalid (until|through)\b/i.test(label)) return 'cert.expirationDate';
  if (/\b(name|certifications?|certificates?|licen[sc]es?|title)\b/i.test(label)) return 'cert.name';
  return undefined;
}

// Local date, as the applicant's calendar shows it.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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
    const key = container.closest(SEL.certificationSection)
      ? certKey(label, kind)
      : FIELD_KEYS[container.dataset.automationId!.slice('formField-'.length)];
    // The applicant chose to have Workday's terms consent ticked for them (README); ADP's "Reviewed" works the same way.
    if (container.dataset.automationId === 'formField-acceptTermsAndAgreements') field.answer = true;
    if (key) field.profileKey = key;
    // The step's upload is the resume even when it is only "Upload a file (5MB max)" (live RTX); the mapper missed it.
    else if (kind === 'file' && !/\bcover\b/i.test(`${label} ${section ?? ''}`)) field.profileKey = 'resumeFile';
    if (kind === 'radio') {
      field.options = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => radioLabel(container, r));
    }
    // Several boxes under one question are a choice among them (live SWIB: the disability form's three answers).
    const boxes = kind === 'checkbox' ? [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')] : [];
    if (boxes.length > 1) { field.options = boxes.map((b) => radioLabel(container, b)); field.members = boxes; }
    // The disability form (CC-305) is signed and dated by the applicant: their whole name, and today.
    if (container.dataset.fkitId?.startsWith(SEL.disabilityFormPrefix)) {
      if (container.dataset.automationId === 'formField-name') field.label = 'Signature (full name)';
      if (container.dataset.automationId === 'formField-dateSignedOn') field.answer = today();
    }
    out.push(field);
  });
  return out;
}
