import { getProfile } from '@/src/storage/store';
import { showBanner } from '@/src/autofill/banner';
import { startWatcher } from '@/src/autofill/watcher';
import { workday } from '@/src/workday/adapter';
import { fillCurrentPage } from '@/src/autofill/fillCurrentPage';

export default defineContentScript({
  matches: ['*://*.myworkdayjobs.com/*', '*://*.myworkday.com/*'],
  main() {
    let banner: { remove(): void } | null = null;
    startWatcher(document, workday, async () => {
      banner?.remove();
      const profile = await getProfile();
      banner = showBanner({
        needsSetup: !profile?.reviewed,
        onFill: () => fillCurrentPage(workday),
        onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
        onDismiss: () => { banner = null; },
      });
    });
  },
});
