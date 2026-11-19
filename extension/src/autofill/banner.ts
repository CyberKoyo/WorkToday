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

export function showBanner(opts: BannerOptions): { host: HTMLElement; remove(): void } {
  const host = document.createElement('div');
  host.id = 'wf-banner-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS}</style><div class="box${opts.framed ? ' framed' : ''}" role="dialog" aria-label="Job Application Filler">
    <strong>Job Application Filler</strong><p class="msg"></p><p class="seen" hidden></p>
    <button class="primary" type="button"></button>${opts.onLog ? '<button class="log" type="button">Log application</button>' : ''}
    <button class="link" type="button">Dashboard</button>
    <button class="link loop" type="button">Loop jobs</button>
    <button class="link copy" type="button" hidden>Copy details</button>
    <button class="close" type="button" aria-label="Dismiss">×</button></div>`;
  const msg = shadow.querySelector('.msg')!;
  const seen = shadow.querySelector<HTMLElement>('.seen')!;
  seen.textContent = opts.notice ?? '';
  seen.hidden = !opts.notice;
  const primary = shadow.querySelector<HTMLButtonElement>('.primary')!;

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
    primary.onclick = async () => {
      primary.disabled = true;
      msg.textContent = 'Filling…';
      try { msg.textContent = await opts.onFill(); }
      catch (e) { msg.textContent = e instanceof Error ? e.message : 'Auto-fill failed.'; }
      finally { primary.disabled = false; copy.hidden = !details; copy.textContent = 'Copy details'; }
    };
    if (opts.autoFill) primary.click();
  }
  if (opts.onLog) shadow.querySelector<HTMLButtonElement>('.log')!.onclick = () => opts.onLog!();
  const link = shadow.querySelector<HTMLButtonElement>('.link')!;
  link.hidden = opts.needsSetup; // the main button already goes there
  link.onclick = () => opts.onSetup();
  const loop = shadow.querySelector<HTMLButtonElement>('.loop')!;
  let looping = false;
  loop.hidden = opts.needsSetup || !opts.onLoop;
  loop.onclick = async () => {
    if (looping) { looping = false; msg.textContent = 'Stopping after this job…'; return; }
    looping = true;
    loop.textContent = 'Stop';
    try { msg.textContent = await opts.onLoop!((s) => { msg.textContent = s; }, () => !looping); }
    catch (e) { msg.textContent = e instanceof Error ? e.message : 'Loop failed.'; }
    finally { looping = false; loop.textContent = 'Loop jobs'; }
  };
  const remove = () => { looping = false; host.remove(); }; // a banner that is gone cannot be told to stop, so it stops
  shadow.querySelector<HTMLButtonElement>('.close')!.onclick = () => { remove(); opts.onDismiss(); };
  // An iframe sized to its content has no visible bottom edge; put the banner where the form starts.
  if (opts.framed) document.body.prepend(host); else document.body.append(host);
  return { host, remove };
}
