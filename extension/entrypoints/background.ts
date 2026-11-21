import { handleMessage } from '@/src/background/handleMessage';
import { injectManual } from '@/src/background/injectManual';
import { ALL_SITES, type BgMessage } from '@/src/messages';
import { CONTENT_MATCHES } from '@/src/ats/matches';

// With "Allow on all sites" granted, auto.js watches every page for an application form (in-house careers sites).
async function registerAuto() {
  if (!(await browser.permissions.contains(ALL_SITES))) return;
  await browser.scripting.registerContentScripts([{ id: 'auto', matches: ['*://*/*'], excludeMatches: CONTENT_MATCHES, js: ['auto.js'], allFrames: true }])
    .catch(() => {}); // already registered: the browser keeps it across restarts
}

export default defineBackground(() => {
  browser.permissions.onAdded.addListener(() => { void registerAuto(); });
  void registerAuto();
  browser.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
    // A reply always goes back: every sender reads a missing reply as a failure, but a lost one leaves it waiting.
    handleMessage(msg, {}, sender.tab, sender.url).then(sendResponse, (e) => { console.warn('[workday-filler]', msg.type, 'failed', e); sendResponse(undefined); });
    return true; // keep channel open for async reply (works in Chrome and Firefox)
  });
  // Toolbar button: `action` in MV3, `browserAction` in Firefox MV2.
  (browser.action ?? browser.browserAction).onClicked.addListener((tab) => {
    if (tab.id !== undefined) void injectManual(tab.id);
  });
});
