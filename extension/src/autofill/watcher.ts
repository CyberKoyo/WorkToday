import { SEL } from '../workday/selectors';
import { clean } from '../workday/extractFields';

export function startWatcher(doc: Document, onStep: (key: string) => void, debounceMs = 500): () => void {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!doc.querySelector(SEL.fieldContainer)) return;
    const key = `${doc.defaultView?.location.pathname ?? ''}|${clean(doc.querySelector(SEL.pageHeader)?.textContent)}`;
    if (key !== last) { last = key; onStep(key); }
  };
  const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, debounceMs); });
  obs.observe(doc.body, { childList: true, subtree: true, characterData: true });
  check();
  return () => { obs.disconnect(); clearTimeout(timer); };
}
