import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { looksLikeApplication, startAuto } from '../../src/autofill/auto';
import { mounted } from '../../src/autofill/mount';
import { saveProfile } from '../../src/storage/store';
import { emptyProfile } from '../../src/profile/profile';

const banners = () => document.querySelectorAll('#wf-banner-host');
const FORM = '<label for="fn">First name</label><input id="fn"><label for="em">Email</label><input id="em"><label for="q">Why us?</label><textarea id="q"></textarea>';
const META = 'https://www.metacareers.com/profile/create_application/1952991802037374/';
const at = (url: string) => (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);

beforeEach(async () => {
  fakeBrowser.reset();
  delete (globalThis as { __wfMounted?: unknown }).__wfMounted;
  document.documentElement.replaceChild(document.createElement('body'), document.body); // detaches earlier watchers
  banners().forEach((b) => b.remove()); // the banner sits beside <body>, so it outlives it
  await saveProfile({ ...emptyProfile(), firstName: 'Ada', reviewed: true });
});

describe('automatic detection on unlisted sites', () => {
  it('takes a careers address and two opening questions', () => {
    document.body.innerHTML = FORM;
    expect(looksLikeApplication(document, META)).toBe(true);
    expect(looksLikeApplication(document, 'https://shop.example.com/checkout')).toBe(false);
    document.body.innerHTML = '<label for="k">Keyword</label><input id="k"><label for="em">Email me new jobs</label><input id="em">';
    expect(looksLikeApplication(document, 'https://www.amazon.jobs/en/search')).toBe(false);
  });

  it('shows the banner once the form appears, with no toolbar click', async () => {
    at(META);
    document.body.innerHTML = '<p>Loading…</p>';
    startAuto();
    expect(mounted()).toBeUndefined();
    document.body.innerHTML = FORM; // the site renders the form later
    await vi.waitFor(() => expect(banners()).toHaveLength(1), { timeout: 2000 });
    expect(mounted()!.adapter.id).toBe('generic');
  });

  it('stays out of pages that are no application', async () => {
    document.body.innerHTML = FORM;
    at('https://example.com/contact');
    startAuto();
    await new Promise((r) => setTimeout(r, 700)); // past the watcher's debounce
    expect(mounted()).toBeUndefined(); // (a banner count would also see the watcher the test above left running)
  });
});
