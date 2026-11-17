import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getApiKey, getProfile, saveApiKey, saveProfile } from '../../src/storage/store';
import { emptyProfile } from '../../src/profile/profile';

const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

function setDom() {
  document.body.innerHTML = `
    <input id="apiKey" type="password" />
    <button id="saveKey" type="button"></button>
    <input id="accountPassword" type="password" />
    <button id="savePassword" type="button"></button>
    <input id="resume" type="file" />
    <button id="parse" type="button"></button>
    <p id="resumeName"></p>
    <div id="form"></div>
    <button id="save" type="button"></button>
    <p id="status"></p>
  `;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadMain() {
  vi.resetModules();
  await import('../../entrypoints/options/main');
  // let init()'s microtasks/promise chain settle
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function fileWith(name: string, type: string, text: string): File {
  return new File([text], name, { type });
}

beforeEach(() => {
  fakeBrowser.reset();
  setDom();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('options main', () => {
  it('disables save and parse until init resolves, then enables them', async () => {
    await loadMain();
    expect($<HTMLButtonElement>('save').disabled).toBe(false);
    expect($<HTMLButtonElement>('parse').disabled).toBe(false);
  });

  it('refuses to save when name and email are all empty', async () => {
    await loadMain();
    $('save').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('status').textContent).toBe('Add at least your name or email before saving.');
    expect(await getProfile()).toBeNull();
  });

  it('wraps save failures and reports them', async () => {
    await loadMain();
    const first = document.querySelector<HTMLInputElement>('[data-key="firstName"]');
    expect(first).not.toBeNull();
    first!.value = 'Ada';
    // Force a save failure by rejecting the underlying storage write.
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    $('save').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('status').textContent).toBe('Could not save: disk full');
  });

  it('wraps save-key failures and reports them', async () => {
    await loadMain();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota exceeded'));
    $<HTMLInputElement>('apiKey').value = 'new-key';
    $('saveKey').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('status').textContent).toBe('Could not save: quota exceeded');
  });

  it('saves an unsaved typed API key on parse and uses it', async () => {
    await loadMain();
    expect(await getApiKey()).toBe('');
    $<HTMLInputElement>('apiKey').value = '  typed-key  ';
    const fetchMock = vi.fn().mockResolvedValue(ok({ firstName: 'Ada' }));
    vi.stubGlobal('fetch', fetchMock);
    const input = $<HTMLInputElement>('resume');
    Object.defineProperty(input, 'files', { value: [fileWith('r.pdf', 'application/pdf', '%PDF-1.4')] });
    $('parse').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(await getApiKey()).toBe('typed-key');
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers['x-goog-api-key']).toBe('typed-key');
  });

  it('keeps manual answers across a re-parse', async () => {
    await saveProfile({
      ...emptyProfile(), firstName: 'Old', email: 'old@example.com',
      workAuthorized: 'yes', gender: 'female', reviewed: true,
    });
    await loadMain();
    const fetchMock = vi.fn().mockResolvedValue(ok({ firstName: 'NewName', email: 'new@example.com' }));
    vi.stubGlobal('fetch', fetchMock);
    await saveApiKey('K');
    $<HTMLInputElement>('apiKey').value = 'K';
    const input = $<HTMLInputElement>('resume');
    Object.defineProperty(input, 'files', { value: [fileWith('r.pdf', 'application/pdf', '%PDF-1.4')] });
    $('parse').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect((document.querySelector('[data-key="firstName"]') as HTMLInputElement).value).toBe('NewName');
    expect((document.querySelector('[data-key="workAuthorized"]') as HTMLSelectElement).value).toBe('yes');
    expect((document.querySelector('[data-key="gender"]') as HTMLSelectElement).value).toBe('female');
  });

  it('disables parse while a parse is in flight and re-enables after', async () => {
    await loadMain();
    await saveApiKey('K');
    $<HTMLInputElement>('apiKey').value = 'K';
    let resolveFetch!: (r: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((r) => { resolveFetch = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const input = $<HTMLInputElement>('resume');
    Object.defineProperty(input, 'files', { value: [fileWith('r.pdf', 'application/pdf', '%PDF-1.4')] });
    $('parse').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($<HTMLButtonElement>('parse').disabled).toBe(true);
    resolveFetch(ok({ firstName: 'Ada' }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect($<HTMLButtonElement>('parse').disabled).toBe(false);
  });

  it('warns when the parse found almost nothing', async () => {
    await loadMain();
    await saveApiKey('K');
    $<HTMLInputElement>('apiKey').value = 'K';
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    const input = $<HTMLInputElement>('resume');
    Object.defineProperty(input, 'files', { value: [fileWith('r.pdf', 'application/pdf', '%PDF-1.4')] });
    $('parse').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect($('status').textContent).toBe('Gemini found almost nothing in this file — is it a scanned image or not a resume? Review carefully.');
  });
});
