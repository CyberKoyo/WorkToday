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
    const t = tieBreak && norm(tieBreak);
    // Options that also name the tie-break come first: one street lists addresses in several states, and only the
    // applicant's has their ZIP (live Oracle: "74-12 35th Ave" listed Hawaii first).
    const named = t ? l.filter((o) => ` ${norm(o.textContent ?? '')} `.includes(` ${t} `)) : [];
    for (const set of named.length ? [named, l] : [l]) {
      const i = matchOption(value, set.map((o) => clean(o.textContent)));
      if (i !== -1) return set[i]!;
    }
    return null;
  };
  let hit = pick();
  if (!hit && input) {
    // Long or server-searched lists (Greenhouse School, Location) only show the match after typing.
    // SuccessFactors picklists filter on keyup, not input, by text the option contains ("NY" is not in "New York").
    const search = (/^[a-z]{2}$/i.test(value.trim()) && US_STATES[value.trim().toUpperCase()]) || value;
    rawSet(input, search);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: search.slice(-1), bubbles: true }));
    // The list can say it has nothing ("No results were found.", live Oracle): no use waiting out the search.
    const listId = target.getAttribute('aria-controls');
    const typed = Date.now();
    const none = () => {
      const list = listId ? c.ownerDocument.getElementById(listId) : null;
      return Date.now() - typed > 700 && !!list && !fresh().length && /\bno (results|matches)\b/i.test(list.textContent ?? '');
    };
    const found = await waitFor(() => pick() ?? (none() ? 'none' : null), timeoutMs * 2);
    hit = found === 'none' ? null : found;
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
