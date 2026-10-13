import type { FillResult } from '../ats/field';
import { matchOption } from '../fill/matchOption';
import { waitFor } from '../fill/dom';
import { US_STATES } from '../fill/usStates';

// Placeholder values: blank, "Please select a country" (-999), "Make a Selection" (-1).
const PLACEHOLDER = new Set(['', '-999', '-1']);
const chosen = (sel: HTMLSelectElement) => !PLACEHOLDER.has(sel.value);

/** The iCIMS widget over a select whose options load only when the widget opens (live: Country, State). */
export function ajaxWidget(sel: HTMLSelectElement): HTMLElement | null {
  if ([...sel.options].some((o) => !PLACEHOLDER.has(o.value))) return null;
  return sel.ownerDocument.getElementById(`${sel.id}_icimsDropdown`);
}

function press(el: HTMLElement) {
  for (const type of ['mouseover', 'mousedown', 'mouseup']) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  el.click();
}

export async function fillAjaxSelect(sel: HTMLSelectElement, widget: HTMLElement, text: string, timeoutMs = 3000): Promise<FillResult> {
  if (chosen(sel)) return 'skipped_nonempty';
  const doc = sel.ownerDocument;
  const items = () => [...doc.querySelectorAll<HTMLElement>(`[id="${sel.id}_dropdown-results"] li.result-selectable`)]
    .filter((li) => li.getAttribute('dropdown-index') !== '-1');
  const find = () => { const l = items(); const i = matchOption(text, l.map((li) => li.title || li.textContent || '')); return i === -1 ? null : l[i]!; };
  press(widget);
  let pick = (await waitFor(() => (items().length ? true : null), timeoutMs)) && find();
  // The list loads a page at a time (live State: 25 of them, no New York); its search box asks for the rest.
  const search = doc.querySelector<HTMLInputElement>(`[id="${sel.id}_icimsDropdown_ctnr"] input.dropdown-search`);
  if (!pick && search) {
    search.focus();
    search.value = US_STATES[text.trim().toUpperCase()] ?? text;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: search.value.slice(-1) }));
    pick = await waitFor(find, timeoutMs);
  }
  if (!pick) { press(widget); return items().length ? 'no_match' : 'error'; } // and close it again
  press(pick);
  const label = pick.title || pick.textContent || '';
  // The widget writes the pick into the select, or at least into its own label.
  const ok = await waitFor(() => chosen(sel)
    || doc.getElementById(`${sel.id}_fakeSelected_icimsDropdown`)?.textContent?.trim() === label.trim(), timeoutMs);
  return ok ? 'filled' : 'error';
}
