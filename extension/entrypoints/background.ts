import { handleMessage } from '@/src/background/handleMessage';
import type { BgMessage } from '@/src/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse);
    return true; // keep channel open for async reply (works in Chrome and Firefox)
  });
});
