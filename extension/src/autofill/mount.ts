import { browser } from 'wxt/browser';
import { getProfile } from '../storage/store';
import type { AtsAdapter } from '../ats/types';
import { showBanner } from './banner';
import { startWatcher } from './watcher';
import { fillCurrentPage } from './fillCurrentPage';
import { resumeReloadPending } from './resumeReload';

export interface Mounted { adapter: AtsAdapter; show: () => Promise<void> }

// The site content script and the toolbar script share the extension's isolated world in each frame,
// so the toolbar script finds the banner a supported site already set up here instead of adding a second.
const KEY = '__wfMounted';
const holder = globalThis as { [KEY]?: Mounted };
export const mounted = (): Mounted | undefined => holder[KEY];

function bannerFor(adapter: AtsAdapter): () => Promise<void> {
  let banner: { remove(): void } | null = null;
  return async () => {
    const profile = await getProfile();
    banner?.remove(); // after the await, so two quick calls still leave one banner
    banner = showBanner({
      needsSetup: !profile?.reviewed,
      framed: window !== window.top,
      autoFill: !!adapter.resumeReloadsPage && resumeReloadPending(), // back from the resume upload's reload
      onFill: () => fillCurrentPage(adapter),
      onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
      onDismiss: () => { banner = null; },
    });
  };
}

/** Show the banner now (if a form is on screen) and on each later step of the application. */
export function mountBanner(adapter: AtsAdapter): Mounted {
  const m: Mounted = { adapter, show: bannerFor(adapter) };
  holder[KEY] = m;
  startWatcher(document, adapter, () => { void m.show(); });
  return m;
}
