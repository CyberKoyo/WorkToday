import { asksIdentity, generic } from '../generic/adapter';
import { mounted, mountBanner, type Start } from './mount';

/** Toolbar popup: offer Auto-fill on this page, whatever the site, or with `start` run it (or the job loop) at once. */
export function startManual(start?: Start): void {
  const known = mounted(); // a supported site, or the button pressed before
  const adapter = known?.adapter ?? generic;
  if (start === 'loop' && window !== window.top) return; // the loop runs on the board itself
  const isForm = adapter.isFormPage(document);
  // Ads, chat widgets and newsletter boxes in other frames stay quiet: a frame mounts only for a supported site or a form
  // that opens like an application (the job loop polls every frame this script reaches).
  if (window !== window.top && !(isForm && (known || asksIdentity(document)))) return;
  const m = known ?? mountBanner(generic);
  // A fresh mount already showed the banner if it saw a form; otherwise answer the press anyway.
  if (!known && isForm && !start) return;
  // A banner from before the extension was reloaded or updated cannot reach it any more: start over in its place.
  m.show(start).catch(() => {
    document.getElementById('wf-banner-host')?.remove();
    void mountBanner(adapter).show(start);
  });
}
