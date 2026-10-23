import { clean, type ExtractedField } from '../ats/field';
import { TEXT_INPUT } from '../fill/dom';
import { norm } from '../fill/matchOption';
import { comboboxValue } from '../generic/combobox';
import type { ProfileValue } from '../profile/profile';

// Legal, consent and self-identification answers stay the applicant's: never remembered across forms, never asked of Gemini.
const PERSONAL = /authori[sz]|sponsor|\bvisa\b|citizen|immigra|gender|\bsex\b|\brac(e|es|ial)\b|ethnic|hispanic|latin[oa]|veteran|military|armed forces|disab|transgender|lgbt|sexual|orientation|pronoun|religio|criminal|convict|felony|background check|acknowledg|consent|\bagree|certify|attest|signature|terms|privacy|salary|compensation/i;

/** A question someone can answer once for every form: a short answer or a choice, about nothing personal or legal. */
export const answerable = (f: ExtractedField) =>
  f.kind !== 'file' && f.kind !== 'textarea' && !(f.kind === 'checkbox' && !f.options) && !PERSONAL.test(f.label);

export const answerKey = (f: Pick<ExtractedField, 'kind' | 'label'>) => `${f.kind}|${norm(f.label)}`;

const checked = (el: HTMLElement) => (el instanceof HTMLInputElement ? el.checked
  : el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true');

/** The answer now on the page, in the form `fill` takes; null when there is none. */
export function readAnswer(f: ExtractedField): ProfileValue | null {
  const c = f.container;
  switch (f.kind) {
    case 'text':
    case 'date': {
      const el = (c.matches('input') ? c : c.querySelector(TEXT_INPUT)) as HTMLInputElement | null;
      return el?.value.trim() || null;
    }
    case 'select': {
      const sel = (c.matches('select') ? c : c.querySelector('select')) as HTMLSelectElement | null;
      if (sel) return sel.value === '' ? null : clean(sel.selectedOptions[0]?.text) || null;
      return comboboxValue(c) || null;
    }
    case 'radio':
    case 'checkbox': {
      const members = f.members ?? [...c.querySelectorAll<HTMLElement>(f.kind === 'radio' ? 'input[type="radio"],[role="radio"]' : 'input[type="checkbox"]')];
      const picked = members.flatMap((m, i) => (checked(m) && f.options?.[i] ? [f.options[i]!] : []));
      if (!picked.length) return null;
      return f.kind === 'radio' ? picked[0]! : picked;
    }
    default:
      return null;
  }
}

const watched = new WeakSet<HTMLElement>();

/** Saves what the applicant enters in these fields, once they settle on it. */
export function rememberAnswers(fields: ExtractedField[], save: (key: string, value: ProfileValue) => void) {
  for (const f of fields.filter(answerable)) {
    if (watched.has(f.container)) continue;
    watched.add(f.container);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      // Comboboxes and button pills update their state after the event; read once the page has caught up.
      timer = setTimeout(() => { const v = readAnswer(f); if (v !== null) save(answerKey(f), v); }, 500);
    };
    for (const type of ['change', 'input', 'click']) f.container.addEventListener(type, settle);
  }
}
