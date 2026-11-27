import { browser } from 'wxt/browser';
import type { Start } from '../autofill/mount';

type Target = { tabId: number; allFrames?: boolean };
const run = async (target: Target, start?: Start) => {
  if (start) await browser.scripting.executeScript({ target, func: (s: Start) => { (globalThis as { __wfStart?: Start }).__wfStart = s; }, args: [start] });
  await browser.scripting.executeScript({ target, files: ['/manual.js'] });
};

/** Run the toolbar script in the tab. activeTab may not reach frames from other sites, so retry the page alone. */
export async function injectManual(tabId: number, start?: Start, exec: (t: Target) => Promise<unknown> = (t) => run(t, start)): Promise<void> {
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
