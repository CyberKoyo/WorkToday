import { asksIdentity, generic } from '../generic/adapter';
import { mounted, mountBanner } from './mount';
import { startWatcher } from './watcher';

// A careers address, and two of the questions every application opens with. Both must hold before the banner shows
// by itself, so a newsletter box or a shop checkout never gets one. The toolbar button skips this check.
const CAREERS = /career|job|appl(y|ic)|recruit|talent|hiring|candidate|vacanc|position/i;

export const looksLikeApplication = (doc: Document, url: string) =>
  CAREERS.test(url) && asksIdentity(doc);

/**
 * Runs on every site once "Allow on all sites" is granted: an employer's own careers site (Meta, Amazon, Microsoft)
 * gets the banner without a toolbar click, as soon as an application form shows. Supported sites are left out where
 * the background registers this script; they mount their own banner.
 * shortcut: a later step that loads as a new page and asks no name or email gets no banner; the toolbar button
 * still works there. Remember the tab's application across loads if in-house sites turn out to reload between steps.
 */
export function startAuto(): void {
  if (window !== window.top && !CAREERS.test(location.href)) return; // ads and widgets: no watcher at all
  const stop = startWatcher(document, {
    isFormPage: (doc) => !mounted() && looksLikeApplication(doc, location.href), // the address changes without a reload
    stepKey: () => 'application',
  }, () => {
    mountBanner(generic); // shows the banner now and on each later step
    queueMicrotask(() => stop());
  });
}
