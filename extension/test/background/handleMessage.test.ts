import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../src/background/handleMessage';
import { MapError } from '../../src/api/mapClient';
import { saveApiKey } from '../../src/storage/store';

describe('handleMessage', () => {
  it('map-fields ok', async () => {
    const mapFields = vi.fn().mockResolvedValue(new Map([['wf-0', 'email']]));
    expect(await handleMessage({ type: 'map-fields', fields: [] }, { mapFields })).toEqual({ ok: true, mappings: [['wf-0', 'email']] });
  });
  it('map-fields error -> code', async () => {
    const mapFields = vi.fn().mockRejectedValue(new MapError('rate_limited', 'x'));
    expect(await handleMessage({ type: 'map-fields', fields: [] }, { mapFields })).toEqual({ ok: false, code: 'rate_limited' });
  });
  it('open-options', async () => {
    const openOptions = vi.fn().mockResolvedValue(undefined);
    await handleMessage({ type: 'open-options' }, { openOptions });
    expect(openOptions).toHaveBeenCalled();
  });
  it('track logs the tab, falling back to the frame that asked', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const msg = { type: 'track' as const, name: 'Apply', url: 'https://boards.greenhouse.io/embed/job_app?token=1', from: 'https://acme.com/' };
    await handleMessage(msg, { track }, { title: 'Engineer - Acme', url: 'https://acme.com/careers/1' });
    await handleMessage(msg, { track }, {});
    const where = { location: undefined, guess: undefined };
    expect(track.mock.calls).toEqual([['Engineer - Acme', 'https://acme.com/careers/1', undefined, 'https://acme.com/', undefined, where], ['Apply', msg.url, undefined, 'https://acme.com/', undefined, where]]);
  });
  it('track prefers the job title the site read off the page over the tab title', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    await handleMessage({ type: 'track', name: 'x', url: 'https://recruiting.ultipro.com/A/JobBoard/1', title: 'Intern - Summer 2027' },
      { track }, { title: 'Intern - Summer 2027 - Search Jobs - INL Interns Careers', url: 'https://recruiting.ultipro.com/A/JobBoard/1' });
    expect(track.mock.calls[0]![0]).toBe('Intern - Summer 2027');
  });
  it('track asks Gemini only when the page found no location, and marks its answer guessed', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const guess = vi.fn().mockResolvedValue('Austin, TX');
    const base = { type: 'track' as const, name: 'x', url: 'https://acme.com/1' };
    await handleMessage({ ...base, location: 'Chicago, IL', text: 'page' }, { track, guess });
    expect(track.mock.calls[0]![5]).toEqual({ location: 'Chicago, IL', guess: undefined });
    await handleMessage({ ...base, text: 'Join us in Austin' }, { track, guess });
    const ask = track.mock.calls[1]![5].guess as () => Promise<string>;
    expect(await ask()).toBe(''); // no key: no call
    expect(guess).not.toHaveBeenCalled();
    await saveApiKey('K');
    expect(await ask()).toBe('Austin, TX (guessed)');
    expect(guess).toHaveBeenCalledWith('Join us in Austin', 'K');
  });
  it('sync-sheet ok and error -> message', async () => {
    const syncSheet = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Google sign-in expired. Connect again.'));
    expect(await handleMessage({ type: 'sync-sheet' }, { syncSheet })).toEqual({ ok: true });
    expect(await handleMessage({ type: 'sync-sheet' }, { syncSheet })).toEqual({ ok: false, message: 'Google sign-in expired. Connect again.' });
  });
  it('answer-fields passes the job text along', async () => {
    const answerFields = vi.fn().mockResolvedValue(new Map());
    await handleMessage({ type: 'answer-fields', fields: [], job: 'Engineer - Acme' }, { answerFields });
    expect(answerFields).toHaveBeenCalledWith([], 'Engineer - Acme');
    // A form in a frame knows only itself; the tab's title names the role and employer.
    await handleMessage({ type: 'answer-fields', fields: [], job: 'First name Last name' }, { answerFields }, { title: 'Software Engineering Intern | MongoDB' });
    expect(answerFields).toHaveBeenLastCalledWith([], 'Software Engineering Intern | MongoDB\nFirst name Last name');
    // Where the site offers the posting itself, it replaces the form's own text.
    const posting = vi.fn().mockResolvedValue('Software Engineering Intern\nInterns push production-level code.');
    const frame = 'https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=8209134';
    await handleMessage({ type: 'answer-fields', fields: [], job: 'First name Last name' }, { answerFields, posting }, { title: 'Intern | MongoDB' }, frame);
    expect(posting).toHaveBeenCalledWith(frame);
    expect(answerFields).toHaveBeenLastCalledWith([], 'Intern | MongoDB\nSoftware Engineering Intern\nInterns push production-level code.');
    // No essay on the page (no job text asked for): nothing is fetched.
    await handleMessage({ type: 'answer-fields', fields: [] }, { answerFields, posting }, {}, frame);
    expect(posting).toHaveBeenCalledTimes(1);
  });
  it('answer-fields ok and error -> message', async () => {
    const answerFields = vi.fn().mockResolvedValueOnce(new Map([['wf-0', ['Yes']]])).mockRejectedValueOnce(new Error('Gemini rejected the API key.'));
    expect(await handleMessage({ type: 'answer-fields', fields: [] }, { answerFields })).toEqual({ ok: true, answers: [['wf-0', ['Yes']]] });
    expect(await handleMessage({ type: 'answer-fields', fields: [] }, { answerFields })).toEqual({ ok: false, message: 'Gemini rejected the API key.' });
  });
  it('hands a saved password only to a supported site\'s own frame, and the account one only to its own site', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { saveAccountPassword, saveLoopSettings } = await import('../../src/storage/store');
    fakeBrowser.reset();
    await saveAccountPassword('pw-acct');
    await saveLoopSettings({ email: 'ada@x.com', password: 'pw-loop', submit: false });
    const ask = (which: 'account' | 'loop', frameUrl?: string) => handleMessage({ type: 'secret', which }, {}, {}, frameUrl);
    expect(await ask('account', 'https://acme.wd5.myworkdayjobs.com/en-US/careers/login')).toEqual({ value: 'pw-acct' });
    expect(await ask('loop', 'https://acme.icims.com/jobs/1/login')).toEqual({ value: 'pw-loop' });
    expect(await ask('account', 'https://acme.icims.com/jobs/1/login')).toEqual({ value: '' }); // not the site it is for
    expect(await ask('loop', 'https://acme.example/careers/login')).toEqual({ value: '' }); // the generic reader's sites
    expect(await ask('loop', 'http://acme.icims.com/jobs/1/login')).toEqual({ value: '' });
    expect(await ask('loop')).toEqual({ value: '' });
  });
  it('says the Gemini key is locked instead of asking Gemini without it', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { setPassphrase } = await import('../../src/storage/store');
    const { lock } = await import('../../src/storage/vault');
    fakeBrowser.reset();
    await setPassphrase('correct horse battery');
    await lock();
    const answerFields = vi.fn();
    expect(await handleMessage({ type: 'answer-fields', fields: [] }, { answerFields })).toEqual({ ok: false, message: expect.stringMatching(/locked/) });
    expect(answerFields).not.toHaveBeenCalled();
  });
});
