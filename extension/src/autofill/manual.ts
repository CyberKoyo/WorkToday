import { generic } from '../generic/adapter';
import { mounted, mountBanner } from './mount';

/** Toolbar button: offer Auto-fill on this page, whatever the site. */
export function startManual(): void {
  const known = mounted(); // a supported site, or the button pressed before
  const adapter = known?.adapter ?? generic;
  const isForm = adapter.isFormPage(document);
  if (window !== window.top && !isForm) return; // ads, chat widgets and other frames stay quiet
  const m = known ?? mountBanner(generic);
  // A fresh mount already showed the banner if it saw a form; otherwise answer the press anyway.
  if (!known && isForm) return;
  // A banner from before the extension was reloaded or updated cannot reach it any more: start over in its place.
  m.show().catch(() => {
    document.getElementById('wf-banner-host')?.remove();
    void mountBanner(adapter).show();
  });
}
