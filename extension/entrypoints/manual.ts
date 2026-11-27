import { startManual } from '@/src/autofill/manual';
import type { Start } from '@/src/autofill/mount';

// Injected by the background on a toolbar click (activeTab), so it reaches sites the manifest does not list.
// injectManual sets __wfStart first (same isolated world, out of the page's reach) when a popup button asks to start.
export default defineUnlistedScript(() => {
  const g = globalThis as { __wfStart?: Start };
  const start = g.__wfStart;
  delete g.__wfStart;
  startManual(start);
});
