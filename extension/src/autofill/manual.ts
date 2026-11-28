import { asksIdentity, generic } from '../generic/adapter';
import { mounted, mountBanner } from './mount';

// Set by the background just before it injects this script for the keyboard shortcut: run Auto-fill, not only offer it.
const AUTO = '__wfAutoFill';

/** Toolbar button: offer Auto-fill on this page, whatever the site. The shortcut also runs it. */
export function startManual(): void {
  const holder = globalThis as { [AUTO]?: boolean };
  const auto = !!holder[AUTO];
  delete holder[AUTO]; // one press, one fill: a later toolbar click only offers it
  const known = mounted(); // a supported site, or the button pressed before
  const adapter = known?.adapter ?? generic;
  const isForm = adapter.isFormPage(document);
  // Ads, chat widgets and newsletter boxes in other frames stay quiet: a frame mounts only for a supported site or a form
  // that opens like an application (the job loop polls every frame this script reaches).
  if (window !== window.top && !(isForm && (known || asksIdentity(document)))) return;
  const m = known ?? mountBanner(generic);
  // A fresh mount already showed the banner if it saw a form; otherwise answer the press anyway.
  if (!known && isForm && !auto) return;
  // A banner from before the extension was reloaded or updated cannot reach it any more: start over in its place.
  m.show(auto).catch(() => {
    document.getElementById('wf-banner-host')?.remove();
    void mountBanner(adapter).show(auto);
  });
}
