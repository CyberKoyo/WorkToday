import type { ExtractedField, FillResult } from '../ats/field';
import type { ProfileValue } from '../profile/profile';
import { TEXT_INPUT, safeClick, setNativeValue, setFilesViaDataTransfer } from '../fill/dom';
import { matchOption } from '../fill/matchOption';
import { adaptForLabel, formatForPlaceholder } from '../fill/dateParts';
import { comboboxOptions, comboboxValue, fillCombobox } from './combobox';

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

function fillRadio(c: HTMLElement, options: string[], text: string, members?: HTMLElement[]): FillResult {
  const radios = members ?? all<HTMLElement>(c, 'input[type="radio"],[role="radio"]');
  const checked = (r: HTMLElement) => (r instanceof HTMLInputElement ? r.checked
    : r.getAttribute('aria-checked') === 'true' || r.getAttribute('aria-pressed') === 'true');
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

/** The choices a dropdown offers, for a question that has to go to Gemini. A combobox lists them only once opened. */
export async function optionsGeneric(f: ExtractedField): Promise<string[]> {
  const sel = own<HTMLSelectElement>(f.container, 'select');
  return sel ? [...sel.options].filter((o) => o.value !== '').map((o) => o.text.trim()) : comboboxOptions(f.container);
}

export async function fillGeneric(f: ExtractedField, value: ProfileValue, timeoutMs = 3000, missed: string[] = []): Promise<FillResult> {
  const c = f.container;
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : adaptForLabel(f.label, value);
  try {
    switch (f.kind) {
      case 'text':
      case 'textarea': {
        // Past an aria-hidden duplicate; unless every box is aria-hidden, as on a form read with `ariaHidden` (live Paycom).
        const boxes = all<HTMLInputElement | HTMLTextAreaElement>(c, f.kind === 'text' ? TEXT_INPUT : 'textarea');
        const el = boxes.find((e) => !e.closest('[aria-hidden="true"]')) ?? boxes[0];
        if (!el) return 'error';
        if (el.value.trim()) return 'skipped_nonempty';
        setNativeValue(el, el instanceof HTMLInputElement ? formatForPlaceholder(el.placeholder, text) : text);
        return 'filled';
      }
      case 'select': {
        const sel = own<HTMLSelectElement>(c, 'select');
        if (sel) return fillNativeSelect(sel, text);
        if (!f.multi || !Array.isArray(value)) return await fillCombobox(c, text, timeoutMs, f.tieBreak);
        // A multi-select takes its choices one at a time; its list closes after each.
        if (comboboxValue(c)) return 'skipped_nonempty';
        let picked = 0;
        for (const v of value) if ((await fillCombobox(c, v, timeoutMs, f.tieBreak, true)) === 'filled') picked++; else missed.push(v);
        return picked ? 'filled' : 'no_match';
      }
      case 'radio':
        return fillRadio(c, f.options ?? [], text, f.members);
      case 'checkbox': {
        const boxes = (f.members as HTMLInputElement[] | undefined) ?? all<HTMLInputElement>(c, 'input[type="checkbox"]');
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
        if (!/^\d{4}-\d{2}(-\d{2})?$/.test(text)) return 'no_match';
        setNativeValue(el, el.type === 'month' ? text.slice(0, 7) : text.length === 7 ? `${text}-01` : text);
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

/** `attached`: whether the field already holds a file; by default, whether its input does. */
export async function fillFileGeneric(
  f: ExtractedField, file: File, setFiles: (input: HTMLInputElement, file: File) => void = setFilesViaDataTransfer,
  attached: (input: HTMLInputElement) => boolean = (input) => !!input.files?.length,
): Promise<FillResult> {
  const input = own<HTMLInputElement>(f.container, 'input[type="file"]');
  if (!input) return 'error';
  if (attached(input)) return 'skipped_nonempty';
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
