import { getProfile } from '@/src/storage/store';
import { showBanner } from '@/src/autofill/banner';
import { startWatcher } from '@/src/autofill/watcher';
import { fillCurrentPage } from '@/src/autofill/fillCurrentPage';
import { pickAdapter } from '@/src/ats/registry';
import { CONTENT_MATCHES } from '@/src/ats/matches';
import { resumeReloadPending } from '@/src/autofill/resumeReload';
import { accountTried, advancePending } from '@/src/autofill/advance';
import { getAccountPassword, getAccountRefused } from '@/src/storage/store';

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
      // The account step does itself once per tab, and only with a saved password: a second try could lock the account.
      const account = !!adapter.accountPage?.(document) && !accountTried() && !!(await getAccountPassword())
        && !(await getAccountRefused()).includes(location.host);
      banner = showBanner({
        needsSetup: !profile?.reviewed,
        framed: window !== window.top,
        // Back from the resume upload's reload, on the step Auto-fill moved to, or a page that fills itself (tax opt-out).
        autoFill: (!!adapter.resumeReloadsPage && resumeReloadPending()) || advancePending() || !!adapter.autoStart || account,
        onFill: () => fillCurrentPage(adapter),
        onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
        onLog: () => { browser.runtime.sendMessage({ type: 'open-tracker', title: document.title }); },
        onDismiss: () => { banner = null; },
      });
    });
  },
});
