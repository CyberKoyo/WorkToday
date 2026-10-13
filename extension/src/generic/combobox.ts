import { clean, type FillResult } from '../ats/field';
import { matchOption, norm } from '../fill/matchOption';
import { pressKey, rawSet, safeClick, waitFor } from '../fill/dom';

// The extractor may hand us the combobox element itself as the container.
const findBox = (c: HTMLElement) => (c.matches('[role="combobox"]') ? c : c.querySelector<HTMLElement>('[role="combobox"]'));

/** The combobox's current choice as shown ('' when empty). */
export function comboboxValue(c: HTMLElement): string {
  const shown = c.querySelector('[class*="single-value"],[class*="multi-value"]');
  if (shown) return clean(shown.textContent);
  // Select-only comboboxes (MUI Select, ojSelect) have no text box and show the choice as their own text.
  const box = findBox(c);
  if (box && !(box instanceof HTMLInputElement) && !box.querySelector('input')) return clean(box.textContent);
  const el = c.matches('input[role="combobox"]') ? c : c.querySelector('input[role="combobox"],[role="combobox"] input');
  return (el as HTMLInputElement | null)?.value.trim() ?? '';
}

/** `tieBreak` picks among options that match `value` equally well: the one that also names it. */
export async function fillCombobox(c: HTMLElement, value: string, timeoutMs = 3000, tieBreak?: string): Promise<FillResult> {
  const box = findBox(c);
  if (!box) return 'error';
  if (comboboxValue(c)) return 'skipped_nonempty';
  const input = box instanceof HTMLInputElement ? box : box.querySelector('input');
  const target = input ?? box;
  const doc = c.ownerDocument;
  // Oracle's cx-select lists role="gridcell" items in a role="grid" popup instead of options in a listbox.
  const OPTION = '[role="option"],[role="gridcell"]';
  // The popup the box names is its own; without one, another list left open on the page is not this combobox's.
  const popupId = target.getAttribute('aria-controls') ?? box.getAttribute('aria-controls');
  const before = new Set(doc.querySelectorAll(OPTION));
  const fresh = () => {
    const popup = popupId ? doc.getElementById(popupId) : null;
    return popup ? [...popup.querySelectorAll<HTMLElement>(OPTION)] : [...doc.querySelectorAll<HTMLElement>(OPTION)].filter((o) => !before.has(o));
  };
  const pick = () => {
    const l = fresh();
    const i = matchOption(value, l.map((o) => clean(o.textContent)));
    if (i !== -1) return l[i]!;
    const t = tieBreak && norm(tieBreak);
    if (!t) return null;
    const named = l.filter((o) => ` ${norm(o.textContent ?? '')} `.includes(` ${t} `));
    const j = matchOption(value, named.map((o) => clean(o.textContent)));
    return j === -1 ? null : named[j]!;
  };

  target.focus();
  for (const open of [
    () => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    () => safeClick(target),
    () => pressKey(target, 'ArrowDown', 40),
  ]) {
    open();
    if (await waitFor(() => (fresh().length ? true : null), Math.min(timeoutMs, 500))) break;
  }
  let hit = pick();
  if (!hit && input) {
    // Long or server-searched lists (Greenhouse School, Location) only show the match after typing.
    rawSet(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hit = await waitFor(pick, timeoutMs * 2);
  }
  if (!hit) {
    console.warn('[workday-filler] no option for', JSON.stringify(value));
    if (input) { rawSet(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); }
    pressKey(target, 'Escape', 27);
    return 'no_match';
  }
  hit.click();
  return 'filled';
}
