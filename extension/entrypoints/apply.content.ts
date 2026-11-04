import { getProfile } from '@/src/storage/store';
import { showBanner } from '@/src/autofill/banner';
import { startWatcher } from '@/src/autofill/watcher';
import { fillCurrentPage } from '@/src/autofill/fillCurrentPage';
import { pickAdapter } from '@/src/ats/registry';
import { CONTENT_MATCHES } from '@/src/ats/matches';
import { resumeReloadPending } from '@/src/autofill/resumeReload';
import { advancePending } from '@/src/autofill/advance';

export default defineContentScript({
  matches: CONTENT_MATCHES,
  allFrames: true, // iCIMS and embedded Greenhouse forms live in iframes
  main() {
    const adapter = pickAdapter(new URL(location.href));
    if (!adapter) return;
    let banner: { remove(): void } | null = null;
    startWatcher(document, adapter, async () => {
      banner?.remove();
      const profile = await getProfile();
      banner = showBanner({
        needsSetup: !profile?.reviewed,
        framed: window !== window.top,
        // Back from the resume upload's reload, on the step Auto-fill moved to, or a page that fills itself (tax opt-out).
        autoFill: (!!adapter.resumeReloadsPage && resumeReloadPending()) || advancePending() || !!adapter.autoStart,
        onFill: () => fillCurrentPage(adapter),
        onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
        onDismiss: () => { banner = null; },
      });
    });
  },
});
