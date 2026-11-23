import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getApiKey, getLoopSettings, getProfile, getResume, getResumes, saveApiKey, saveApplications, saveProfile } from '../../src/storage/store';
import { emptyProfile } from '../../src/profile/profile';

const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

function setDom() {
  document.body.innerHTML = `
    <input id="apiKey" type="password" />
    <button id="saveKey" type="button"></button>
    <input id="accountPassword" type="password" />
    <button id="savePassword" type="button"></button>
    <button id="loopAllow" type="button"></button>
    <input id="loopEmail" /><input id="loopPassword" type="password" /><input id="loopSubmit" type="checkbox" /><button id="saveLoop" type="button"></button>
    <button id="wipe" type="button"></button>
    <input id="resume" type="file" />
    <button id="parse" type="button"></button>
    <ul id="resumes"></ul><p id="resumeName"></p>
    <div id="form"></div>
    <button id="save" type="button"></button>
    <p id="status"></p>
    <b id="statApps"></b><b id="statWeek"></b><b id="statAnswers"></b><b id="statProfile"></b>
    <div id="setup"><ol id="setupSteps"></ol></div>
    <a id="sheetLink"></a><button id="sheetBtn" type="button"></button>
    <table><tbody id="apps"></tbody></table><p id="appsEmpty"></p><p id="sheetNote"></p>
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
  fakeBrowser.permissions.contains = async () => allSites; // the fake browser has no permissions
  fakeBrowser.permissions.request = async () => (allSites = true);
  allSites = false;
});
let allSites = false;

describe('options main', () => {
  it('shows whether all sites are allowed, and saves the job loop settings', async () => {
    await loadMain();
    expect($<HTMLButtonElement>('loopAllow').disabled).toBe(false);
    $('loopAllow').click();
    await vi.waitFor(() => expect($('loopAllow').textContent).toBe('✓ Allowed on all sites'));
    expect($<HTMLButtonElement>('loopAllow').disabled).toBe(true);
    $<HTMLInputElement>('loopEmail').value = ' ada@x.com ';
    $<HTMLInputElement>('loopPassword').value = 'pw';
    $<HTMLInputElement>('loopSubmit').checked = true;
    $('saveLoop').click();
    await vi.waitFor(async () => expect(await getLoopSettings()).toEqual({ email: 'ada@x.com', password: 'pw', submit: true }));
  });
  it('deletes all stored data only after the user confirms', async () => {
    await saveApiKey('k');
    await loadMain();
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...location, reload } as Location);
    vi.stubGlobal('confirm', () => false);
    $('wipe').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(await getApiKey()).toBe('k');
    vi.stubGlobal('confirm', () => true);
    $('wipe').click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
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

  it('checks a saved key with Google and says whether it works', async () => {
    await loadMain();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    $<HTMLInputElement>('apiKey').value = ' good-key ';
    $('saveKey').click();
    await vi.waitFor(() => expect($('status').textContent).toBe('Key saved. Google accepts it.'));
    expect(fetchMock.mock.calls[0]![1].headers['x-goog-api-key']).toBe('good-key');
    $<HTMLInputElement>('apiKey').value = 'bad-key';
    $('saveKey').click();
    await vi.waitFor(() => expect($('status').textContent).toBe('Key saved, but Google rejects it. Copy it again from AI Studio.'));
    expect(await getApiKey()).toBe('bad-key');
  });

  it('dashboard: counts, setup steps left, and the applications newest first, titles as text', async () => {
    const today = new Date().toLocaleDateString('en-CA');
    await saveApplications([
      { name: 'Old job', url: 'https://old.example.com/1', date: '2020-01-01' },
      { name: '<img src=x onerror=alert(1)>', url: 'https://acme.com/jobs/2', date: today },
    ]);
    await fakeBrowser.storage.local.set({ tracker: [{ id: 't', title: 'Analyst', company: 'Globex', date: '2021-06-01', salary: '', location: 'Chicago, IL', status: 'Interview Scheduled' }] });
    await saveApiKey('K');
    await loadMain();
    expect([$('statApps').textContent, $('statWeek').textContent, $('statAnswers').textContent]).toEqual(['3', '1', '0']);
    expect($('statProfile').textContent).toBe('○ Not set up');
    expect($('setup').hidden).toBe(false);
    expect([...$('setupSteps').children].map((li) => li.textContent)).toEqual(
      ['✓ Add your Gemini API key (done)', '○ Upload your resume', '○ Review and save your profile']);
    const rows = [...$('apps').querySelectorAll('tr')];
    expect(rows.map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ['<img src=x onerror=alert(1)>', 'Acme', today, 'acme.com', 'Applied', 'Edit'], ['Analyst', 'Globex', '2021-06-01', 'Chicago, IL', 'Interview Scheduled', 'Edit'],
      ['Old job', 'Example', '2020-01-01', 'old.example.com', 'Applied', 'Edit']]);
    expect(rows[1]!.querySelector<HTMLAnchorElement>('[aria-label="Edit Analyst"]')!.href).toMatch(/\/tracker\.html\?edit=t$/);
    expect($('apps').querySelector('img')).toBeNull();
    expect(rows[0]!.querySelector('a')!.href).toBe('https://acme.com/jobs/2');
    expect($('appsEmpty').hidden).toBe(true);
    expect($<HTMLButtonElement>('sheetBtn').disabled).toBe(true); // no Google client ID in this build
    // An application logged from a job tab shows up without a reload (copied into the log beside the others).
    await saveApplications([{ name: 'Only', url: 'https://acme.com/jobs/3', date: today }]);
    await vi.waitFor(() => expect($('statApps').textContent).toBe('4'));
  });

  it('keeps several resume versions: all are read together, one is attached, any can be removed', async () => {
    await saveApiKey('k');
    await loadMain();
    expect($('resumeName').textContent).toBe('No resume stored.');
    const fetchMock = vi.fn().mockImplementation(async () => ok({ firstName: 'Ada' }));
    vi.stubGlobal('fetch', fetchMock);
    const input = $<HTMLInputElement>('resume');
    Object.defineProperty(input, 'files', { configurable: true, value: [fileWith('swe.pdf', 'application/pdf', '%PDF-1.4 a'), fileWith('data.pdf', 'application/pdf', '%PDF-1.4 b')] });
    $('parse').click();
    await vi.waitFor(() => expect($('status').textContent).toBe('Parsed. Review below, then Save.'));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).contents[0].parts).toHaveLength(3); // both files and the prompt
    const rows = () => [...$('resumes').children].map((li) => li.textContent);
    expect(rows()).toEqual(['swe.pdf (attached to applications) Remove', 'data.pdf Attach this oneRemove'.replace('oneRemove', 'one Remove')]);
    expect((await getResume())!.name).toBe('swe.pdf');
    $('resumes').querySelector<HTMLButtonElement>('[aria-label="Attach data.pdf to applications"]')!.click();
    await vi.waitFor(async () => expect((await getResume())!.name).toBe('data.pdf'));
    await vi.waitFor(() => expect(rows()[0]).toBe('data.pdf (attached to applications) Remove'));
    // Adding a file again replaces its older copy; with nothing chosen, the stored ones are read again.
    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    $('resumes').querySelector<HTMLButtonElement>('[aria-label="Remove swe.pdf"]')!.click();
    await vi.waitFor(async () => expect((await getResumes()).map((r) => r.name)).toEqual(['data.pdf']));
    fetchMock.mockClear();
    $('parse').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).contents[0].parts).toHaveLength(2);
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
