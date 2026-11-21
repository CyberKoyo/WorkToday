import { browser } from 'wxt/browser';

// A note that the next page or step should fill itself. Kept in extension storage, not the page's sessionStorage:
// page script can write that, and a page-set note would start Auto-fill (and hand over the profile) with no click.
// Read once per page into memory, so mark/pending/clear stay synchronous for the callers' ordering.
// shortcut: keyed per site, not per tab; a second tab of the same site inside the fresh window also fills itself.
export function marker(name: string, freshMs: number) {
  const key = `${name}|${location.origin}`;
  let at = 0;
  let touched = false; // set or cleared on this page before storage answered: that wins
  const loaded = browser.storage.local.get(key).then((r) => { if (!touched && typeof r[key] === 'number') at = r[key]; }, () => {});
  const put = (t: number): Promise<void> => {
    at = t;
    touched = true;
    return (t ? browser.storage.local.set({ [key]: t }) : browser.storage.local.remove(key)).catch(() => {});
  };
  return { loaded, mark: () => put(Date.now()), pending: () => Date.now() - at < freshMs, clear: () => put(0) };
}
