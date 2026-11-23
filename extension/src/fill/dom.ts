import type { ProfileValue } from '../profile/profile';

export const TEXT_INPUT = 'input:not([type]),input[type="text"],input[type="email"],input[type="tel"],input[type="url"],input[type="number"]';

/** A dropdown's "nothing chosen" entry. Not always blank: JazzHR's is "-- No answer --" (value resumator_no_selection). */
export const placeholderOption = (o: HTMLOptionElement) => o.value === ''
  || /^\W*(?:no answer|no selection|(?:please\s+)?(?:select|choose|pick)(?:\s+(?:one|an?\s+(?:option|answer)))?)\W*$/i.test(o.text);

export type ValueEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export const asText = (v: ProfileValue) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);

export function rawSet(el: ValueEl, value: string) {
  // React-controlled inputs ignore el.value = x; call the prototype setter so React sees the change.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
}

export function setNativeValue(el: ValueEl, value: string) {
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

/** Clicks el unless it is a button that would submit or reset its form (type defaults to submit). */
export function safeClick(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement && el.type !== 'button' && el.form) return false;
  el.click();
  return true;
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
export function pressKey(el: HTMLElement, key: string, keyCode: number) {
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const init = { key, code: key, keyCode, which: keyCode, charCode: type === 'keypress' ? keyCode : 0, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent(type, init as KeyboardEventInit));
  }
}

export function setFilesViaDataTransfer(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}
