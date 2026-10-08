import type { AtsAdapter } from '../ats/types';

export function startWatcher(
  doc: Document, page: Pick<AtsAdapter, 'isFormPage' | 'stepKey'>, onStep: (key: string) => void, debounceMs = 500,
): () => void {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!page.isFormPage(doc)) return;
    const key = page.stepKey(doc);
    if (key !== last) { last = key; onStep(key); }
  };
  const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, debounceMs); });
  obs.observe(doc.body, { childList: true, subtree: true, characterData: true });
  check();
  return () => { obs.disconnect(); clearTimeout(timer); };
}
