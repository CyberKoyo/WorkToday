import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startManual } from '../../src/autofill/manual';
import { mountBanner, mounted } from '../../src/autofill/mount';
import { saveProfile } from '../../src/storage/store';
import { emptyProfile } from '../../src/profile/profile';
import type { AtsAdapter } from '../../src/ats/types';

const banners = () => document.querySelectorAll('#wf-banner-host');
const msg = () => banners()[0]!.shadowRoot!.querySelector('.msg')!.textContent;
const press = (sel: string) => banners()[0]!.shadowRoot!.querySelector<HTMLButtonElement>(sel)!.click();
const FORM = `<form id="apply"><label for="fn">First name</label><input id="fn"><label for="em">Email</label><input id="em"></form>`;

// The banner's shadow root is closed to the page; these tests read it as if it were open.
const attach = Element.prototype.attachShadow;
const openShadows = () => vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) { return attach.call(this, { ...init, mode: 'open' }); });

beforeEach(async () => {
  vi.restoreAllMocks();
  openShadows();
  fakeBrowser.reset();
  delete (globalThis as { __wfMounted?: unknown }).__wfMounted;
  // A fresh <body> detaches watchers left by earlier tests.
  document.documentElement.replaceChild(document.createElement('body'), document.body);
  await saveProfile({ ...emptyProfile(), firstName: 'Ada', reviewed: true });
});

describe('toolbar button', () => {
  it('offers Auto-fill on an unlisted site with a form, once per press', async () => {
    document.body.innerHTML = FORM;
    startManual();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    expect(mounted()!.adapter.id).toBe('generic');
    startManual();
    startManual();
    await new Promise((r) => setTimeout(r, 20));
    expect(banners()).toHaveLength(1);
  });

  it('stays out of a frame whose lone form is not an application (newsletter, chat)', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    document.body.innerHTML = '<form><label for="em">Email</label><input id="em"><button>Send</button></form>';
    startManual();
    await new Promise((r) => setTimeout(r, 20));
    expect(banners()).toHaveLength(0);
    expect(mounted()).toBeUndefined();
  });

  it('answers the press on a page with no form', async () => {
    document.body.innerHTML = '<p>Thanks for applying.</p>';
    startManual();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    press('.primary');
    // Auto-fill first waits up to 4s for a step still rendering its fields.
    await vi.waitFor(() => expect(msg()).toBe('Found nothing to fill on this page.'), 6000);
  }, 10000);

  it('brings back a dismissed banner on a supported site instead of adding a generic one', async () => {
    document.body.innerHTML = FORM;
    const site: AtsAdapter = {
      id: 'greenhouse', detect: () => true, isFormPage: () => true, stepKey: () => 'step', extract: () => [],
      fill: vi.fn(), fillFile: vi.fn(), ensureGroups: vi.fn(),
    };
    mountBanner(site);
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    press('.close');
    expect(banners()).toHaveLength(0);
    startManual();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    expect(mounted()!.adapter).toBe(site);
  });
});
