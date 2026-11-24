export interface BannerOptions { needsSetup: boolean; onFill: () => Promise<string>; onSetup: () => void; onDismiss: () => void; framed?: boolean; autoFill?: boolean; onLog?: () => void
  /** Shown under the message: past applications this job may be (tracker/seen.ts). */
  notice?: string
  /** Job boards: run the loop, reporting progress through `say` until `stopped()`; resolves to the closing line. */
  onLoop?: (say: (s: string) => void, stopped: () => boolean) => Promise<string> }

// What the last Auto-fill saw and did on this page, for a bug report. Set by fillCurrentPage.
let details = '';
export const setDetails = (s: string) => { details = s; };

const CSS = `
  .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px; padding: 12px 14px;
    background: #fff; color: #1f2937; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
    font: 14px system-ui, sans-serif; }
  .box.framed { position: static; width: auto; margin: 8px 0; }
  .msg { margin: 6px 0 10px; }
  .seen { margin: 0 0 10px; padding: 8px 10px; background: #fff7e6; border-radius: 6px; white-space: pre-line; font-size: 13px; }
  .primary { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  .primary:disabled { opacity: .6; cursor: default; }
  .log { background: none; border: 0; color: #2563eb; padding: 8px; cursor: pointer; text-decoration: underline; }
  .link { background: none; border: 0; color: #2563eb; cursor: pointer; padding: 8px; font: inherit; }
  .close { position: absolute; top: 6px; right: 8px; background: none; border: 0; font-size: 18px; cursor: pointer; }`;

// Clickjacking: a page decides when this box appears and owns everything around it, so it could pop the box up under
// a click meant for something else, or fade it, filter it or (Chrome sees this) lay a decoy over it. Auto-fill and
// Loop jobs count a press only once the box has sat unchanged and visible for ARM_MS.
export const ARM_MS = 500;
const WAIT = 'Press again: this box only works once it has been on screen, uncovered, for a moment.';
const HIDES = /opacity\(|blur\(|(brightness|contrast)\(0(\.\d+)?\)/; // invert() (dark-mode add-ons) still shows the box

function faded(host: HTMLElement): boolean {
  if (!host.isConnected || (host.checkVisibility && !host.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return true;
  let opacity = 1;
  for (let a: Element | null = host; a; a = a.parentElement) {
    const s = getComputedStyle(a);
    opacity *= Number(s.opacity || 1);
    if (HIDES.test(s.filter)) return true;
  }
  return opacity < 0.95;
}

function pressGuard(host: HTMLElement, box: Element) {
  let armed = false, onScreen = true, timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => { armed = false; clearTimeout(timer); timer = setTimeout(() => { armed = onScreen; }, ARM_MS); };
  const watch = new MutationObserver(arm);
  watch.observe(host, { attributes: true });
  // Chrome only (IntersectionObserver v2): whether the box is really seen, uncovered and unfaded. Firefox reports nothing.
  let seen: IntersectionObserver | undefined;
  try {
    seen = new IntersectionObserver((entries) => {
      const v = (entries.at(-1) as IntersectionObserverEntry & { isVisible?: boolean }).isVisible;
      if (v === undefined || v === onScreen) return;
      onScreen = v;
      if (v) arm(); else armed = false;
    }, { threshold: [1], trackVisibility: true, delay: 100 } as IntersectionObserverInit);
    seen.observe(box);
  } catch { /* no IntersectionObserver: the delay and the fade check still apply */ }
  arm();
  return {
    ok(say: (s: string) => void): boolean {
      if (armed && !faded(host)) return true;
      say(WAIT);
      arm();
      return false;
    },
    stop() { clearTimeout(timer); watch.disconnect(); seen?.disconnect(); },
  };
}

export function showBanner(opts: BannerOptions): { host: HTMLElement; shadow: ShadowRoot; remove(): void } {
  const host = document.createElement('div');
  host.id = 'wf-banner-host';
  // Closed: page script must not read the past-applications notice or press the buttons (Auto-fill hands it the profile).
  const shadow = host.attachShadow({ mode: 'closed' });
  // A constant literal: nothing from the page or the profile is parsed as markup (AMO's linter checks this).
  shadow.innerHTML = `<div class="box" role="dialog" aria-label="Job Application Filler">
    <strong>Job Application Filler</strong><p class="msg"></p><p class="seen" hidden></p>
    <button class="primary" type="button"></button><button class="log" type="button" hidden>Log application</button>
    <button class="link" type="button">Dashboard</button>
    <button class="link loop" type="button">Loop jobs</button>
    <button class="link copy" type="button" hidden>Copy details</button>
    <button class="close" type="button" aria-label="Dismiss">×</button></div>`;
  shadow.prepend(Object.assign(document.createElement('style'), { textContent: CSS }));
  shadow.querySelector('.box')!.classList.toggle('framed', !!opts.framed);
  const msg = shadow.querySelector('.msg')!;
  const seen = shadow.querySelector<HTMLElement>('.seen')!;
  seen.textContent = opts.notice ?? '';
  seen.hidden = !opts.notice;
  const primary = shadow.querySelector<HTMLButtonElement>('.primary')!;
  const say = (s: string) => { msg.textContent = s; };
  // The page cannot reach inside the shadow root, but it owns the host: page CSS (all a hosted ATS lets an employer add)
  // gets nothing to restyle on it, and script that does restyle it re-arms the guard.
  host.style.cssText = 'all: initial !important; display: block !important;';
  const guard = pressGuard(host, shadow.querySelector('.box')!);

  // Something filled wrong: one press puts what the reader saw on the clipboard, to paste into a bug report.
  const copy = shadow.querySelector<HTMLButtonElement>('.copy')!;
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(details); copy.textContent = 'Copied'; }
    catch { console.info(details); copy.textContent = 'In the console (F12)'; } // a frame may not write the clipboard
  };

  if (opts.needsSetup) {
    msg.textContent = 'Set up and review your profile first.';
    primary.textContent = 'Open setup';
    primary.onclick = () => opts.onSetup();
  } else {
    msg.textContent = 'Fill this page from your profile?';
    primary.textContent = 'Auto-fill';
    const run = async () => {
      primary.disabled = true;
      msg.textContent = 'Filling…';
      try { msg.textContent = await opts.onFill(); }
      catch (e) { msg.textContent = e instanceof Error ? e.message : 'Auto-fill failed.'; }
      finally { primary.disabled = false; copy.hidden = !details; copy.textContent = 'Copy details'; }
    };
    primary.onclick = () => { if (guard.ok(say)) void run(); };
    if (opts.autoFill) void run(); // the extension's own decision (the loop, the step after Next): no press to guard
  }
  const log = shadow.querySelector<HTMLButtonElement>('.log')!;
  log.hidden = !opts.onLog;
  log.onclick = () => opts.onLog?.();
  const link = shadow.querySelector<HTMLButtonElement>('.link')!;
  link.hidden = opts.needsSetup; // the main button already goes there
  link.onclick = () => opts.onSetup();
  const loop = shadow.querySelector<HTMLButtonElement>('.loop')!;
  let looping = false;
  loop.hidden = opts.needsSetup || !opts.onLoop;
  loop.onclick = async () => {
    if (looping) { looping = false; msg.textContent = 'Stopping after this job…'; return; }
    if (!guard.ok(say)) return;
    looping = true;
    loop.textContent = 'Stop';
    try { msg.textContent = await opts.onLoop!((s) => { msg.textContent = s; }, () => !looping); }
    catch (e) { msg.textContent = e instanceof Error ? e.message : 'Loop failed.'; }
    finally { looping = false; loop.textContent = 'Loop jobs'; }
  };
  const remove = () => { looping = false; guard.stop(); host.remove(); }; // a banner that is gone cannot be told to stop, so it stops
  shadow.querySelector<HTMLButtonElement>('.close')!.onclick = () => { remove(); opts.onDismiss(); };
  // An iframe sized to its content has no visible bottom edge; put the banner where the form starts.
  if (opts.framed) document.body.prepend(host); else document.body.append(host);
  return { host, shadow, remove };
}
