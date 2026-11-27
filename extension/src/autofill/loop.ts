import { browser } from 'wxt/browser';
import type { BgMessage, LoopReply } from '../messages';
import { applyTargets, log, resetActed, type Step } from './loopPage';

/** How one job ended. `sent`: Next/Submit was pressed and the form went away. `stuck`: left for the applicant.
 * `applied`: applied to before, left unfilled. `none`: no form showed. */
export type Outcome = 'sent' | 'filled' | 'stuck' | 'applied' | 'none';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const POLL_MS = 2000;
const MAX_POLLS = 40;  // per job, however many steps it has
const APPLY_AT = 2;    // quiet polls before the posting's own Apply button is pressed
const MAX_JOBS = 25;   // per press of "Loop jobs": a feed that never ends must not apply without end
const MAX_MISSES = 3;  // jobs in a row that opened nothing: the browser is blocking the board's pop-ups

/**
 * Step a job's page until it is done. `poll` runs one step in every frame of the page and says what each did.
 * `patience`: quiet polls to wait for a form before giving the job up.
 */
export async function drive(poll: (clickApply: boolean) => Promise<Array<Step | 'inject'>>, wait = sleep, patience = 8): Promise<Outcome> {
  let acted = false;
  let idle = 0;
  for (let i = 0; i < MAX_POLLS; i++) {
    await wait(POLL_MS);
    const steps = await poll(!acted && idle === APPLY_AT);
    if (steps.includes('applied')) return 'applied';
    if (steps.includes('stuck')) return 'stuck';
    if (steps.includes('filled')) return 'filled';
    if (steps.includes('acted')) acted = true;
    if (steps.includes('acted') || steps.includes('progress')) { idle = 0; continue; }
    // Quiet: the next step is loading, the site refused the last one (`waiting`), or the form is gone for good.
    if (++idle >= (acted ? 4 : patience)) return steps.includes('waiting') ? 'stuck' : acted ? 'sent' : 'none';
  }
  return 'stuck';
}

const send = (m: BgMessage) => browser.runtime.sendMessage(m) as Promise<LoopReply>;
const samePage = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

/**
 * Work down the board's job list: open each job, let the background step its tab (or step the application here when
 * the board shows it in its own page), come back, and scroll for more when the list runs out. Resolves to the closing line.
 * shortcut: more jobs come from scrolling only; a board with numbered pages stops at the end of its page.
 */
export async function runLoop(say: (s: string) => void, stopped: () => boolean, inPage: () => Promise<Step>, ask = send, wait = sleep): Promise<string> {
  const seen = new Set<HTMLElement>();
  const next = () => applyTargets(document).find((el) => !seen.has(el));
  const tally: Record<Outcome, number> = { sent: 0, filled: 0, stuck: 0, applied: 0, none: 0 };
  let last: HTMLElement | undefined;
  let jobs = 0;
  let misses = 0;
  let reply = await ask({ type: 'loop-start' });
  while (reply?.ok && !stopped() && jobs < MAX_JOBS && misses < MAX_MISSES) {
    let el = next();
    if (!el) {
      // End of what is loaded: take the list (whatever box scrolls it) and the page to the bottom, and give the board a moment.
      for (let p = last?.parentElement; p; p = p.parentElement) p.scrollTop = p.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await wait(2500);
      if (!(el = next())) break;
    }
    seen.add(el);
    last = el;
    say(`Job ${++jobs}…`);
    // A real link is opened by the background: no pop-up blocker in the way, and this tab stays on the board.
    const url = el instanceof HTMLAnchorElement && /^https?:/.test(el.href) && !samePage(el.href, location.href) ? el.href : undefined;
    log(`job ${jobs}:`, url ? `opening ${url}` : `pressing "${(el.textContent ?? '').trim()}"`);
    if (!url) el.click();
    reply = await ask({ type: 'loop-job', known: reply.known, url });
    if (!reply?.ok) break;
    let outcome = reply.outcome;
    if (!outcome) { // no tab: the application may have opened right here
      log(`job ${jobs}: no new tab opened; looking for an application in this page`);
      resetActed();
      outcome = await drive(async () => [await inPage()], wait, 3);
      misses = outcome === 'none' ? misses + 1 : 0;
    } else misses = 0;
    log(`job ${jobs}:`, outcome);
    tally[outcome]++;
  }
  if (!jobs) return reply?.ok ? 'No Apply buttons found on this page.' : reply?.message ?? 'Loop failed.';
  const why = !reply?.ok ? `${reply?.message ?? 'Loop failed.'} `
    : misses >= MAX_MISSES ? 'Apply buttons stopped opening anything. If the browser is blocking pop-ups (address bar), allow them for this site and start again. '
    : jobs >= MAX_JOBS ? `Paused at ${MAX_JOBS} jobs; press Loop jobs to go on. ` : '';
  return `${why}${jobs} jobs: ${tally.sent} sent, ${tally.filled} filled, ${tally.stuck} need you, ${tally.applied} already applied, ${tally.none} with no form. Check each tab.`;
}
