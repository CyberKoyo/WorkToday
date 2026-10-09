import type { ExtractedField, FillResult } from '../ats/field';
import type { ProfileValue } from '../profile/profile';
import { TEXT_INPUT, safeClick, setNativeValue, setFilesViaDataTransfer } from '../fill/dom';
import { matchOption } from '../fill/matchOption';
import { adaptForLabel, formatForPlaceholder } from '../fill/dateParts';
import { fillCombobox } from './combobox';

const own = <T extends Element>(c: HTMLElement, sel: string) => (c.matches(sel) ? c : c.querySelector(sel)) as T | null;
const all = <T extends Element>(c: HTMLElement, sel: string) => [...(c.matches(sel) ? [c as unknown as T] : []), ...c.querySelectorAll<T>(sel)];

const isYes = (s: string) => /^(yes|true|y)$/i.test(s);

function fillNativeSelect(sel: HTMLSelectElement, text: string): FillResult {
  if (sel.value !== '') return 'skipped_nonempty';
  const real = [...sel.options].filter((o) => o.value !== '');
  const i = matchOption(text, real.map((o) => o.text));
  if (i === -1) return 'no_match';
  setNativeValue(sel, real[i]!.value);
  return 'filled';
}

function fillRadio(c: HTMLElement, options: string[], text: string): FillResult {
  const radios = all<HTMLElement>(c, 'input[type="radio"],[role="radio"]');
  const checked = (r: HTMLElement) => (r instanceof HTMLInputElement ? r.checked : r.getAttribute('aria-checked') === 'true');
  if (radios.some(checked)) return 'skipped_nonempty';
  const i = matchOption(text, options);
  if (i === -1) return 'no_match';
  return safeClick(radios[i]!) ? 'filled' : 'error';
}

function fillChecks(boxes: HTMLInputElement[], options: string[], values: string[], missed: string[]): FillResult {
  if (boxes.some((b) => b.checked)) return 'skipped_nonempty';
  let ticked = 0;
  const misses: string[] = [];
  for (const v of values) {
    const i = matchOption(v, options);
    if (i === -1) { misses.push(v); continue; }
    if (!boxes[i]!.checked) { boxes[i]!.click(); ticked++; }
  }
  if (!ticked) return 'no_match';
  missed.push(...misses);
  return 'filled';
}

export async function fillGeneric(f: ExtractedField, value: ProfileValue, timeoutMs = 3000, missed: string[] = []): Promise<FillResult> {
  const c = f.container;
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : adaptForLabel(f.label, value);
  try {
    switch (f.kind) {
      case 'text':
      case 'textarea': {
        const el = all<HTMLInputElement | HTMLTextAreaElement>(c, f.kind === 'text' ? TEXT_INPUT : 'textarea')
          .find((e) => !e.closest('[aria-hidden="true"]'));
        if (!el) return 'error';
        if (el.value.trim()) return 'skipped_nonempty';
        setNativeValue(el, el instanceof HTMLInputElement ? formatForPlaceholder(el.placeholder, text) : text);
        return 'filled';
      }
      case 'select': {
        const sel = own<HTMLSelectElement>(c, 'select');
        return sel ? fillNativeSelect(sel, text) : await fillCombobox(c, text, timeoutMs);
      }
      case 'radio':
        return fillRadio(c, f.options ?? [], text);
      case 'checkbox': {
        const boxes = all<HTMLInputElement>(c, 'input[type="checkbox"]');
        if (boxes.length > 1) return fillChecks(boxes, f.options ?? [], Array.isArray(value) ? value : [text], missed);
        const cb = boxes[0];
        if (!cb) return 'error';
        if (cb.checked) return 'skipped_nonempty';
        if (value === true || isYes(text)) cb.click();
        return 'filled';
      }
      case 'date': {
        const el = own<HTMLInputElement>(c, 'input');
        if (!el) return 'error';
        if (el.value) return 'skipped_nonempty';
        if (!/^\d{4}-\d{2}$/.test(text)) return 'no_match';
        setNativeValue(el, el.type === 'month' ? text : `${text}-01`);
        return 'filled';
      }
      case 'file':
        return 'no_match'; // files go through fillFileGeneric
    }
  } catch (e) {
    console.warn('[workday-filler] fill failed', f.label, e);
    return 'error';
  }
}

export async function fillFileGeneric(
  f: ExtractedField, file: File, setFiles: (input: HTMLInputElement, file: File) => void = setFilesViaDataTransfer,
): Promise<FillResult> {
  const input = own<HTMLInputElement>(f.container, 'input[type="file"]');
  if (!input) return 'error';
  if (input.files?.length) return 'skipped_nonempty';
  try {
    setFiles(input, file);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled';
  } catch (e) {
    console.warn('[workday-filler] file upload failed', e);
    return 'error';
  }
}
