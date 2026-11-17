import { browser } from 'wxt/browser';

type Target = { tabId: number; allFrames?: boolean };
const run = (target: Target) => browser.scripting.executeScript({ target, files: ['/manual.js'] });

/** Run the toolbar script in the tab. activeTab may not reach frames from other sites, so retry the page alone. */
export async function injectManual(tabId: number, exec: (t: Target) => Promise<unknown> = run): Promise<void> {
  try {
    await exec({ tabId, allFrames: true });
    return;
  } catch { /* a frame refused; fall through */ }
  try {
    await exec({ tabId });
  } catch (e) {
    console.warn('Job Application Filler cannot run on this page.', e); // browser pages, extension stores
  }
}
