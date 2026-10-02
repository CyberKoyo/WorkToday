import { SEL } from '../workday/selectors';
import { clean, type ExtractedField } from '../workday/extractFields';
import { matchOption } from './matchOption';
import type { ProfileValue } from '../profile/profile';

export type FillResult = 'filled' | 'skipped_nonempty' | 'no_match' | 'error';

const asText = (v: ProfileValue) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);

function rawSet(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React-controlled inputs ignore el.value = x; call the prototype setter so React sees the change.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
}

export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  rawSet(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

export function typeChars(el: HTMLInputElement, text: string) {
  el.focus();
  let acc = '';
  for (const ch of text) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    acc += ch;
    rawSet(el, acc);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

export async function waitFor<T>(fn: () => T | null, timeoutMs = 3000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Workday reads keyCode. Pass it in the init dict (legacy, supported by Chrome and Firefox): a property
// defined on the event from the content script's isolated world is invisible to the page.
function pressKey(el: HTMLElement, key: string, keyCode: number) {
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const init = { key, code: key, keyCode, which: keyCode, charCode: type === 'keypress' ? keyCode : 0, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent(type, init as KeyboardEventInit));
  }
}

async function fillMultiselect(c: HTMLElement, values: string[], timeoutMs: number, missed: string[]): Promise<FillResult> {
  const input = c.querySelector<HTMLInputElement>('input');
  if (!input) return 'error';
  const chips = () => c.querySelectorAll(SEL.multiSelectChip).length;
  if (chips()) return 'skipped_nonempty';
  const doc = c.ownerDocument;
  const results = () => [...doc.querySelectorAll<HTMLElement>(SEL.promptResult)];
  const labelOf = (o: HTMLElement) => o.querySelector<HTMLElement>(SEL.promptLabel)?.dataset.automationLabel ?? clean(o.textContent);
  // The list is virtualized and keeps rendering rows after opening, so a search is detected by a new
  // total (aria-setsize) or a new first row, never by the row count alone.
  const listKey = () => { const r = results(); return r.length ? `${r[0]!.getAttribute('aria-setsize')}|${labelOf(r[0]!)}` : ''; };

  const box = input;
  // One value: search it, then keep what Enter added or pick the unique match. Returns whether a chip was added.
  const searchAndPick = async (value: string, first: boolean): Promise<boolean> => {
    box.focus();
    if (first) { box.click(); await waitFor(() => (results().length ? true : null), Math.min(timeoutMs, 1500)); }
    const before = listKey();
    const chipsBefore = chips();
    const gained = () => (chips() > chipsBefore ? true : null);
    rawSet(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    pressKey(box, 'Enter', 13);
    // Workday adds an exact term on Enter by itself; otherwise it lists results to pick from.
    const outcome = await waitFor(() => (gained() ? 'entered' : results().length && listKey() !== before ? 'listed' : null), timeoutMs);
    if (outcome !== 'listed') return outcome === 'entered';
    const found = results();
    const i = matchOption(value, found.map(labelOf));
    if (i === -1) return false;
    const row = found[i]!;
    const leaf = row.querySelector<HTMLElement>(SEL.promptLeaf);
    // Already selected: clicking would uncheck it.
    if (leaf?.dataset.automationChecked === 'Checked') return !!(await waitFor(gained, Math.min(timeoutMs, 1000)));
    (leaf ?? row).click();
    return !!(await waitFor(gained, timeoutMs));
  };

  let added = 0;
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  for (const [n, value] of unique.entries()) {
    if (await searchAndPick(value, n === 0)) added++;
    else missed.push(value);
  }
  rawSet(box, '');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  pressKey(box, 'Escape', 27);
  return added ? 'filled' : 'no_match';
}

async function fillSelect(c: HTMLElement, value: string, timeoutMs: number): Promise<FillResult> {
  const btn = c.querySelector<HTMLButtonElement>(SEL.dropdownButton)!;
  const current = clean(btn.textContent);
  if (current && current !== SEL.dropdownPlaceholder) return 'skipped_nonempty';
  const doc = c.ownerDocument;
  // Other listboxes (e.g. multiselect chips) may already be on the page; only options this click opens count.
  const before = new Set(doc.querySelectorAll(SEL.listboxOption));
  btn.click();
  const opts = await waitFor(() => {
    const l = [...doc.querySelectorAll<HTMLElement>(SEL.listboxOption)].filter((o) => !before.has(o));
    return l.length ? l : null;
  }, timeoutMs);
  if (!opts) return 'error';
  const i = matchOption(value, opts.map((o) => o.textContent ?? ''));
  if (i === -1) {
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'no_match';
  }
  opts[i]!.click();
  return 'filled';
}

/** `missed` collects values a multiselect prompt could not take (reported to the user by name). */
export async function fillField(f: ExtractedField, value: ProfileValue, timeoutMs = 3000, missed: string[] = []): Promise<FillResult> {
  const c = f.container;
  try {
    switch (f.kind) {
      case 'text':
      case 'textarea': {
        if (c.querySelector(SEL.multiSelect)) {
          return await fillMultiselect(c, Array.isArray(value) ? value : [typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value], timeoutMs, missed);
        }
        const el = c.querySelector<HTMLInputElement | HTMLTextAreaElement>(f.kind === 'text' ? SEL.textInput : 'textarea')!;
        if (el.value.trim()) return 'skipped_nonempty';
        setNativeValue(el, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : asText(value));
        return 'filled';
      }
      case 'select':
        return await fillSelect(c, asText(value), timeoutMs);
      case 'radio': {
        const radios = [...c.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
        if (radios.some((r) => r.checked)) return 'skipped_nonempty';
        const i = matchOption(asText(value), f.options ?? []);
        if (i === -1) return 'no_match';
        radios[i]!.click();
        return 'filled';
      }
      case 'checkbox': {
        const cb = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        if (cb.checked) return 'skipped_nonempty';
        if (value === true || /^(yes|true|y)$/i.test(asText(value))) cb.click();
        return 'filled';
      }
      case 'date': {
        const month = c.querySelector<HTMLInputElement>(SEL.dateMonth);
        const year = c.querySelector<HTMLInputElement>(SEL.dateYear);
        if (month?.value || year?.value) return 'skipped_nonempty';
        const m = asText(value).match(/^(\d{4})(?:-(\d{2}))?$/);
        if (!m || !year || (month && !m[2])) return 'no_match';
        if (month) typeChars(month, m[2]!);
        typeChars(year, m[1]!);
        return 'filled';
      }
      case 'file':
        return 'no_match'; // files go through fillFile
    }
  } catch (e) {
    console.warn('[workday-filler] fill failed', f.label, e);
    return 'error';
  }
}

function setFilesViaDataTransfer(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

export async function fillFile(
  f: ExtractedField, file: File, setFiles: (input: HTMLInputElement, file: File) => void = setFilesViaDataTransfer,
): Promise<FillResult> {
  if (f.container.querySelector(SEL.fileUploaded)) return 'skipped_nonempty';
  const input = f.container.querySelector<HTMLInputElement>(SEL.fileInput);
  if (!input) return 'error';
  try {
    setFiles(input, file);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled';
  } catch (e) {
    console.warn('[workday-filler] file upload failed', e);
    return 'error';
  }
}
