import { browser } from 'wxt/browser';
import { ALL_SITES, type LoopReply } from '../messages';
import { drive } from '../autofill/loop';
import { log, type Step } from '../autofill/loopPage';
import { injectManual } from './injectManual';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tabIds = async () => (await browser.tabs.query({})).map((t) => t.id!);
const STEP_MAX_MS = 120_000; // a frame that navigates mid-fill may never answer

// Runs inside each frame of the job tab, in the extension's isolated world, where mount.ts left `__wfMounted`.
// Self-contained: executeScript sends its source, not its imports.
function step(clickApply: boolean, since: number): Promise<Step> | 'inject' | null {
  const m = (globalThis as { __wfMounted?: { loopStep(clickApply: boolean, since: number): Promise<Step> } }).__wfMounted;
  return m ? m.loopStep(clickApply, since) : window === window.top ? 'inject' : null;
}

export async function loopStart(): Promise<LoopReply> {
  return (await browser.permissions.contains(ALL_SITES)) ? { ok: true, known: await tabIds() }
    : { ok: false, message: 'Allow all sites first: Dashboard, then Settings.' };
}

/** One job: find the tab the board just opened (or open `url`), step its application to the end, return to the board. */
export async function loopJob(msg: { known: number[]; url?: string }, boardId: number): Promise<LoopReply> {
  const since = Date.now(); // rows logged from here on are this job's own, not a past application
  let tabId = msg.url ? (await browser.tabs.create({ url: msg.url })).id : undefined;
  for (let i = 0; tabId === undefined && i < 10; i++) { // a clicked button's tab takes a moment to exist
    await sleep(500);
    tabId = (await tabIds()).find((id) => !msg.known.includes(id));
  }
  log(tabId === undefined ? 'no new tab appeared for this job' : `stepping tab ${tabId}`);
  if (tabId === undefined) return { ok: true, known: msg.known }; // no outcome: the board looks for the application in its own page
  const job = tabId;
  const outcome = await drive(async (clickApply) => {
    const frames = await Promise.race([
      browser.scripting.executeScript({ target: { tabId: job, allFrames: true }, func: step, args: [clickApply, since] }),
      sleep(STEP_MAX_MS).then(() => []),
    ]).catch(() => []); // still loading, navigating, or a page extensions cannot touch
    const steps = frames.map((f) => f.result as Step | 'inject');
    // shortcut: an unlisted site is injected once per page load, so a form in a frame that loads later is missed; the toolbar button still reaches it.
    if (steps.includes('inject')) await injectManual(job);
    log(`tab ${job}:`, frames.length ? steps.map((x) => x ?? 'nothing').join(', ') : 'not reachable yet');
    return steps;
  });
  log(`tab ${job} ended:`, outcome);
  await browser.tabs.update(boardId, { active: true }).catch(() => {}); // board closed: its loop is gone with it
  return { ok: true, known: await tabIds(), outcome };
}
