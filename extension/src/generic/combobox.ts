import { clean, type FillResult } from '../ats/field';
import { matchOption, norm } from '../fill/matchOption';
import { pressKey, rawSet, safeClick, waitFor } from '../fill/dom';
import { US_STATES } from '../fill/usStates';

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

// Open the combobox's list. `fresh` reads the options now on show.
async function openList(c: HTMLElement, timeoutMs: number) {
  const box = findBox(c);
  if (!box) return null;
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
  target.focus();
  for (const open of [
    () => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    () => safeClick(target),
    () => pressKey(target, 'ArrowDown', 40),
  ]) {
    open();
    if (await waitFor(() => (fresh().length ? true : null), Math.min(timeoutMs, 500))) break;
  }
  return { input, target, fresh };
}

/** The choices a closed combobox offers: opened, read, closed again. A list that waits for typing (School) reads as empty. */
export async function comboboxOptions(c: HTMLElement, timeoutMs = 3000): Promise<string[]> {
  const list = await openList(c, timeoutMs);
  if (!list) return [];
  const labels = list.fresh().map((o) => clean(o.textContent)).filter(Boolean);
  pressKey(list.target, 'Escape', 27);
  return labels;
}

/** `tieBreak` picks among options that match `value` equally well: the one that also names it.
 * `append`: a multi-select that already holds a choice takes another. */
export async function fillCombobox(c: HTMLElement, value: string, timeoutMs = 3000, tieBreak?: string, append = false): Promise<FillResult> {
  if (!findBox(c)) return 'error';
  if (!append && comboboxValue(c)) return 'skipped_nonempty';
  const { input, target, fresh } = (await openList(c, timeoutMs))!;
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
  let hit = pick();
  if (!hit && input) {
    // Long or server-searched lists (Greenhouse School, Location) only show the match after typing.
    // SuccessFactors picklists filter on keyup, not input, by text the option contains ("NY" is not in "New York").
    const search = (/^[a-z]{2}$/i.test(value.trim()) && US_STATES[value.trim().toUpperCase()]) || value;
    rawSet(input, search);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: search.slice(-1), bubbles: true }));
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
