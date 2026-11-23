import type { AtsAdapter } from '../ats/types';
import { shadowRoots } from '../generic/extract';

export function startWatcher(
  doc: Document, page: Pick<AtsAdapter, 'isFormPage' | 'stepKey'>, onStep: (key: string) => void, debounceMs = 500,
): () => void {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const opts = { childList: true, subtree: true, characterData: true };
  const watched = new WeakSet<Node>();
  const check = () => {
    // A document observer does not see inside shadow roots, where web-component apps render their form (live UKG).
    for (const r of shadowRoots(doc.body)) if (!watched.has(r)) { watched.add(r); obs.observe(r, opts); }
    if (!page.isFormPage(doc)) return;
    const key = page.stepKey(doc);
    if (key !== last) { last = key; onStep(key); }
  };
  const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, debounceMs); });
  obs.observe(doc.body, opts);
  check();
  return () => { obs.disconnect(); clearTimeout(timer); };
}
