export interface BannerOptions { needsSetup: boolean; onFill: () => Promise<string>; onSetup: () => void; onDismiss: () => void; framed?: boolean; autoFill?: boolean; onLog?: () => void }

const CSS = `
  .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px; padding: 12px 14px;
    background: #fff; color: #1f2937; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
    font: 14px system-ui, sans-serif; }
  .box.framed { position: static; width: auto; margin: 8px 0; }
  .msg { margin: 6px 0 10px; }
  .primary { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  .primary:disabled { opacity: .6; cursor: default; }
  .log { background: none; border: 0; color: #2563eb; padding: 8px; cursor: pointer; text-decoration: underline; }
  .close { position: absolute; top: 6px; right: 8px; background: none; border: 0; font-size: 18px; cursor: pointer; }`;

export function showBanner(opts: BannerOptions): { host: HTMLElement; remove(): void } {
  const host = document.createElement('div');
  host.id = 'wf-banner-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS}</style><div class="box${opts.framed ? ' framed' : ''}" role="dialog" aria-label="Job Application Filler">
    <strong>Job Application Filler</strong><p class="msg"></p>
    <button class="primary" type="button"></button>${opts.onLog ? '<button class="log" type="button">Log application</button>' : ''}
    <button class="close" type="button" aria-label="Dismiss">×</button></div>`;
  const msg = shadow.querySelector('.msg')!;
  const primary = shadow.querySelector<HTMLButtonElement>('.primary')!;

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
      finally { primary.disabled = false; }
    };
    if (opts.autoFill) primary.click();
  }
  if (opts.onLog) shadow.querySelector<HTMLButtonElement>('.log')!.onclick = () => opts.onLog!();
  shadow.querySelector<HTMLButtonElement>('.close')!.onclick = () => { host.remove(); opts.onDismiss(); };
  // An iframe sized to its content has no visible bottom edge; put the banner where the form starts.
  if (opts.framed) document.body.prepend(host); else document.body.append(host);
  return { host, remove: () => host.remove() };
}
