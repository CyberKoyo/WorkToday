import { handleMessage } from '@/src/background/handleMessage';
import { ALL_SITES, type BgMessage } from '@/src/messages';
import { CONTENT_MATCHES } from '@/src/ats/matches';
import { injectManual } from '@/src/background/injectManual';

// With "Allow on all sites" granted, auto.js watches every page for an application form (in-house careers sites).
async function registerAuto() {
  if (!(await browser.permissions.contains(ALL_SITES))) return;
  await browser.scripting.registerContentScripts([{ id: 'auto', matches: ['*://*/*'], excludeMatches: CONTENT_MATCHES, js: ['auto.js'], allFrames: true }])
    .catch(() => {}); // already registered: the browser keeps it across restarts
}

export default defineBackground(() => {
  // A fresh install opens setup: nothing works until a profile is saved, and nothing else says where to start.
  browser.runtime.onInstalled.addListener(({ reason }) => { if (reason === 'install') void browser.runtime.openOptionsPage(); });
  browser.permissions.onAdded.addListener(() => { void registerAuto(); });
  void registerAuto();
  // The Auto-fill shortcut (activeTab, as the popup's button): the flag makes manual.js run the fill, not only offer it.
  browser.commands.onCommand.addListener((cmd, tab) => {
    if (cmd !== 'autofill' || tab?.id === undefined) return;
    void injectManual(tab.id, async (target) => {
      await browser.scripting.executeScript({ target, func: () => { (globalThis as { __wfAutoFill?: boolean }).__wfAutoFill = true; } });
      return browser.scripting.executeScript({ target, files: ['/manual.js'] });
    });
  });
  browser.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
    // A reply always goes back: every sender reads a missing reply as a failure, but a lost one leaves it waiting.
    handleMessage(msg, {}, sender.tab, sender.url).then(sendResponse, (e) => { console.warn('[workday-filler]', msg.type, 'failed', e); sendResponse(undefined); });
    return true; // keep channel open for async reply (works in Chrome and Firefox)
  });
});
