import { browser } from 'wxt/browser';
import { getAccountRefused, getApplications, getLoopSettings, getProfile, LOOP_BEAT_MS, LOOP_STATUS, saveLoopStatus, type LoopStatus } from '../storage/store';
import { askSecret } from './secret';
import type { AtsAdapter } from '../ats/types';
import { showBanner } from './banner';
import { startWatcher } from './watcher';
import { fillCurrentPage } from './fillCurrentPage';
import { resumeReloadLoaded, resumeReloadPending } from './resumeReload';
import { accountTried, advanceLoaded, advancePending, watchManualNext } from './advance';
import { runLoop } from './loop';
import { loopStep as step, type Filled, type Step } from './loopPage';
import type { AutofillReport } from './runAutofill';
import { asksIdentity } from '../generic/adapter';
import { getApplications as getTracked, today } from '../tracker/store';
import { alreadyApplied, likelyApplied } from '../tracker/seen';

// Past applications this job may be, as a line for the banner. Read once per page: the steps after it reuse it.
async function seenNotice(): Promise<string> {
  const logged = await getApplications(); // first and alone: it moves old tracker rows out, once
  const hits = likelyApplied(document.title, location.href, today(), logged, await getTracked());
  return hits.length ? `You may have applied here before:\n${hits.map((h) => `• ${h.title}${h.company ? ` at ${h.company}` : ''} (${[h.date, h.status].filter(Boolean).join(', ')})`).join('\n')}` : '';
}

export type Start = 'fill' | 'loop';

export interface Mounted {
  adapter: AtsAdapter;
  /** `start`: run Auto-fill or the job loop at once (the toolbar popup's buttons). */
  show: (start?: Start) => Promise<void>;
  /** The job loop's poll of this frame (background/loop.ts, or the board itself for an application in its own page). */
  /** `since`: when the background started this job (its tabs only; the board's in-page applications pass none). */
  loopStep: (clickApply: boolean, since?: number) => Promise<Step>;
}

// The site content script and the toolbar script share the extension's isolated world in each frame,
// so the toolbar script finds the banner a supported site already set up here instead of adding a second.
const KEY = '__wfMounted';
// Reading another origin's location throws, from a content script too.
const crossOrigin = () => { try { return window.top!.location.origin !== location.origin; } catch { return true; } };
const holder = globalThis as { [KEY]?: Mounted };
export const mounted = (): Mounted | undefined => holder[KEY];

function bannerFor(adapter: AtsAdapter): Pick<Mounted, 'show' | 'loopStep'> {
  let banner: { remove(): void } | null = null;
  let filling: Promise<string> | null = null; // the Auto-fill in flight: the loop joins it instead of starting a second
  let report: AutofillReport | null = null;   // what that fill found
  let looping = false;                        // this page is a board whose loop is running in the banner
  const top = window === window.top;
  let notice: Promise<string> | null = null;
  let shows = 0; // the latest show() wins, so two quick calls leave one banner, and the one asked for last
  // A second press while a fill runs joins it instead of filling the page twice.
  const fill = () => (filling ??= fillCurrentPage(adapter, (r) => { report = r; }).finally(() => { filling = null; }));
  const runHere = async (say: (s: string) => void, stopped: () => boolean) => {
    looping = true;
    try { return await runLoop(say, stopped, () => loopStep(false)); } finally { looping = false; }
  };
  // The popup's Loop jobs: no banner on the board. Progress goes to storage for the popup, which stops it the same way.
  const loopFromPopup = async () => {
    looping = true; // before the first await: a second press must not start a second loop
    let stop = false;
    let text = 'Starting…';
    const save = (s: string, running = true) => { text = s; return saveLoopStatus({ running, text: s, at: Date.now() }); };
    const onChange = (c: Record<string, { newValue?: unknown }>) => { if ((c[LOOP_STATUS]?.newValue as LoopStatus | undefined)?.stop) stop = true; };
    browser.storage.onChanged.addListener(onChange);
    const beat = setInterval(() => { void save(text); }, LOOP_BEAT_MS); // a closed tab stops beating: the popup reads that as ended
    let result: string;
    try { await save(text); result = await runHere((s) => { void save(s); }, () => stop); }
    catch (e) { result = e instanceof Error ? e.message : 'Loop failed.'; }
    finally { looping = false; clearInterval(beat); browser.storage.onChanged.removeListener(onChange); }
    await save(result, false);
  };
  const show = async (start?: Start) => {
    if (looping) return; // an application opening inside the board must not replace the banner that runs the loop
    const n = ++shows;
    const profile = await getProfile();
    await Promise.all([advanceLoaded, resumeReloadLoaded]); // the self-fill notes this page was left
    // The account step does itself once per tab, and only with a saved password: a second try could lock the account.
    // Create Account sends no password, so it fills even after a refused Sign In (no account yet, live NVIDIA).
    const step = adapter.accountPage?.(document);
    const account = !!step && !!(await askSecret('account'))
      && (step === 'create' || (!accountTried() && !(await getAccountRefused()).includes(location.host)));
    const seen = await (notice ??= seenNotice().catch(() => ''));
    if (n !== shows) return;
    banner?.remove();
    if (start === 'loop' && top && profile?.reviewed) { banner = null; void loopFromPopup(); return; }
    banner = showBanner({
      needsSetup: !profile?.reviewed,
      framed: !top,
      notice: seen,
      // The loop, back from the resume upload's reload, on the step Auto-fill moved to, or a page that fills itself (tax opt-out).
      autoFill: start === 'fill' || (!!adapter.resumeReloadsPage && resumeReloadPending()) || advancePending() || !!adapter.autoStart || account,
      onFill: fill,
      onSetup: () => { browser.runtime.sendMessage({ type: 'open-options' }); },
      onLog: () => { browser.runtime.sendMessage({ type: 'open-tracker', title: document.title }); },
      onDismiss: () => { banner = null; },
      // A page of jobs, not an application.
      onLoop: top && !adapter.isFormPage(document) ? runHere : undefined,
    });
  };
  // In a job's tab the loop presses the banner's Auto-fill, so the tab keeps the summary; on the board it fills directly.
  const loopFill = async (): Promise<Filled> => {
    if (!filling) {
      report = null;
      if (looping) void fill().catch(() => {}); else await show('fill');
    }
    if (!filling) return null; // profile not reviewed: nothing ran
    try { await filling; } catch { return 'attention'; }
    const r = report as AutofillReport | null;
    if (r?.reloading || r?.advanced) return 'reloading'; // Auto-fill already pressed Next: the loop must not press again
    if (!r || (!r.filled && !r.skipped && !r.attention.length)) return 'nothing';
    return !r.attention.length && !r.answerError ? 'clean' : 'attention';
  };
  // shortcut: an application the board shows in its own page is never checked (the board's address is every job's); check its title alone if that matters.
  const applied = (since: number) => async () => {
    const logged = await getApplications(); // first and alone: it moves old tracker rows out, once
    return alreadyApplied(document.title, location.href, since, logged, await getTracked());
  };
  const loopStep = async (clickApply: boolean, since?: number) =>
    // The loop's password comes from the background, and only when a supported site shows a password box to type it in.
    step({ adapter, settings: { ...(await getLoopSettings()), password: adapter.id !== 'generic' && document.querySelector('input[type="password"]') ? await askSecret('loop') : '' }, fill: loopFill, applied: since === undefined ? undefined : applied(since), top, clickApply, inPage: looping, asksIdentity: () => asksIdentity(document),
      signInHere: adapter.id !== 'generic', foreign: adapter.id === 'generic' && !top && crossOrigin() });
  return { show, loopStep };
}

/** Show the banner now (if a form is on screen) and on each later step of the application. */
export function mountBanner(adapter: AtsAdapter): Mounted {
  const m: Mounted = { adapter, ...bannerFor(adapter) };
  holder[KEY] = m;
  watchManualNext(document);
  startWatcher(document, adapter, () => { void m.show(); });
  return m;
}
