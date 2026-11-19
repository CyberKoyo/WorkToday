import { browser } from 'wxt/browser';
import { getAccountPassword, getAccountRefused, getLoopSettings, getProfile } from '../storage/store';
import type { AtsAdapter } from '../ats/types';
import { showBanner } from './banner';
import { startWatcher } from './watcher';
import { fillCurrentPage } from './fillCurrentPage';
import { resumeReloadPending } from './resumeReload';
import { accountTried, advancePending, watchManualNext } from './advance';
import { runLoop } from './loop';
import { loopStep as step, type Filled, type Step } from './loopPage';
import type { AutofillReport } from './runAutofill';
import { asksIdentity } from '../generic/adapter';
import { getApplications } from '../storage/store';
import { getApplications as getTracked, today } from '../tracker/store';
import { likelyApplied } from '../tracker/seen';

// Past applications this job may be, as a line for the banner. Read once per page: the steps after it reuse it.
async function seenNotice(): Promise<string> {
  const logged = await getApplications(); // first and alone: it moves old tracker rows out, once
  const hits = likelyApplied(document.title, location.href, today(), logged, await getTracked());
  return hits.length ? `You may have applied here before:\n${hits.map((h) => `• ${h.title}${h.company ? ` at ${h.company}` : ''} (${[h.date, h.status].filter(Boolean).join(', ')})`).join('\n')}` : '';
}

export interface Mounted {
  adapter: AtsAdapter;
  show: () => Promise<void>;
  /** The job loop's poll of this frame (background/loop.ts, or the board itself for an application in its own page). */
  loopStep: (clickApply: boolean) => Promise<Step>;
}

// The site content script and the toolbar script share the extension's isolated world in each frame,
// so the toolbar script finds the banner a supported site already set up here instead of adding a second.
const KEY = '__wfMounted';
const holder = globalThis as { [KEY]?: Mounted };
export const mounted = (): Mounted | undefined => holder[KEY];

function bannerFor(adapter: AtsAdapter): Pick<Mounted, 'show' | 'loopStep'> {
  let banner: { remove(): void } | null = null;
  let filling: Promise<string> | null = null; // the Auto-fill in flight: the loop joins it instead of starting a second
  let report: AutofillReport | null = null;   // what that fill found
  let looping = false;                        // this page is a board whose loop is running in the banner
  const top = window === window.top;
  let notice: Promise<string> | null = null;
  const fill = () => (filling = fillCurrentPage(adapter, (r) => { report = r; }).finally(() => { filling = null; }));
  const show = async (auto = false) => {
    if (looping) return; // an application opening inside the board must not replace the banner that runs the loop
    const profile = await getProfile();
    // The account step does itself once per tab, and only with a saved password: a second try could lock the account.
    const account = !!adapter.accountPage?.(document) && !accountTried() && !!(await getAccountPassword())
      && !(await getAccountRefused()).includes(location.host);
    const seen = await (notice ??= seenNotice().catch(() => ''));
    banner?.remove(); // after the await, so two quick calls still leave one banner
    banner = showBanner({
      needsSetup: !profile?.reviewed,
      framed: !top,
      notice: seen,
      // The loop, back from the resume upload's reload, on the step Auto-fill moved to, or a page that fills itself (tax opt-out).
      autoFill: auto || (!!adapter.resumeReloadsPage && resumeReloadPending()) || advancePending() || !!adapter.autoStart || account,
      onFill: fill,
      onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
      onLog: () => { browser.runtime.sendMessage({ type: 'open-tracker', title: document.title }); },
      onDismiss: () => { banner = null; },
      // A page of jobs, not an application.
      onLoop: top && !adapter.isFormPage(document) ? async (say, stopped) => {
        looping = true;
        try { return await runLoop(say, stopped, () => loopStep(false)); } finally { looping = false; }
      } : undefined,
    });
  };
  // In a job's tab the loop presses the banner's Auto-fill, so the tab keeps the summary; on the board it fills directly.
  const loopFill = async (): Promise<Filled> => {
    if (!filling) {
      report = null;
      if (looping) void fill().catch(() => {}); else await show(true);
    }
    if (!filling) return null; // profile not reviewed: nothing ran
    try { await filling; } catch { return 'attention'; }
    const r = report as AutofillReport | null;
    if (r?.reloading || r?.advanced) return 'reloading'; // Auto-fill already pressed Next: the loop must not press again
    if (!r || (!r.filled && !r.skipped && !r.attention.length)) return 'nothing';
    return !r.attention.length && !r.answerError ? 'clean' : 'attention';
  };
  const loopStep = async (clickApply: boolean) =>
    step({ adapter, settings: await getLoopSettings(), fill: loopFill, top, clickApply, inPage: looping, asksIdentity: () => asksIdentity(document) });
  return { show: () => show(), loopStep };
}

/** Show the banner now (if a form is on screen) and on each later step of the application. */
export function mountBanner(adapter: AtsAdapter): Mounted {
  const m: Mounted = { adapter, ...bannerFor(adapter) };
  holder[KEY] = m;
  watchManualNext(document);
  startWatcher(document, adapter, () => { void m.show(); });
  return m;
}
