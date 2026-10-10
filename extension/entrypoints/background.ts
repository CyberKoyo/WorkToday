import { handleMessage } from '@/src/background/handleMessage';
import { injectManual } from '@/src/background/injectManual';
import type { BgMessage } from '@/src/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse);
    return true; // keep channel open for async reply (works in Chrome and Firefox)
  });
  // Toolbar button: `action` in MV3, `browserAction` in Firefox MV2.
  (browser.action ?? browser.browserAction).onClicked.addListener((tab) => {
    if (tab.id !== undefined) void injectManual(tab.id);
  });
});
