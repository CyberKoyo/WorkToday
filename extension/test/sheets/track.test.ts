import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { trackApplication, syncSheet } from '../../src/sheets/track';
import { getApplications, getSheet, saveSheet } from '../../src/storage/store';

const day = new Date(2026, 10, 13, 23, 30); // local time: late evening must still be the 13th
const connected = () => saveSheet({ id: 'S1', url: 'https://docs.google.com/spreadsheets/d/S1', token: 'T', expires: Date.now() + 3_600_000 });
const stubFetch = (status = 200) => {
  const f = vi.fn().mockImplementation(async () => new Response('{}', { status }));
  vi.stubGlobal('fetch', f);
  return f;
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('trackApplication', () => {
  it('logs an application once per URL, with the local date; other schemes are refused', async () => {
    await trackApplication('  Engineer  -  Acme ', 'https://acme.com/jobs/1#step-2', day);
    await trackApplication('Engineer - Acme', 'https://acme.com/jobs/1#review', day);
    await trackApplication('', 'https://acme.com/jobs/2', day);
    await trackApplication('x', 'javascript:alert(1)', day);
    expect(await getApplications()).toEqual([
      { name: 'Engineer - Acme', url: 'https://acme.com/jobs/1', date: '2026-11-13' },
      { name: 'acme.com', url: 'https://acme.com/jobs/2', date: '2026-11-13' },
    ]);
  });

  it('two logged together are both kept', async () => {
    await Promise.all([trackApplication('A', 'https://a.com/1', day), trackApplication('B', 'https://b.com/1', day)]);
    expect((await getApplications()).map((a) => a.name)).toEqual(['A', 'B']);
  });

  it('with a sheet connected, appends each new row once, as plain text', async () => {
    await connected();
    const f = stubFetch();
    await trackApplication('=HYPERLINK("evil")', 'https://acme.com/jobs/1', day);
    await trackApplication('Analyst', 'https://acme.com/jobs/2', day);
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://sheets.googleapis.com/v4/spreadsheets/S1/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS');
    expect(init.headers.authorization).toBe('Bearer T');
    expect(JSON.parse(init.body)).toEqual({ values: [['=HYPERLINK("evil")', '2026-11-13', 'https://acme.com/jobs/1']] });
    expect(JSON.parse(f.mock.calls[1]![1].body).values).toEqual([['Analyst', '2026-11-13', 'https://acme.com/jobs/2']]);
    expect((await getApplications()).every((a) => a.synced)).toBe(true);
    await syncSheet();
    expect(f).toHaveBeenCalledTimes(2); // nothing waiting, nothing sent
  });

  it('a sheet failure keeps the row for the next sync; a deleted sheet is forgotten', async () => {
    await connected();
    stubFetch(500);
    await trackApplication('Engineer', 'https://acme.com/jobs/1', day);
    expect(await getApplications()).toEqual([{ name: 'Engineer', url: 'https://acme.com/jobs/1', date: '2026-11-13' }]);
    await expect(syncSheet()).rejects.toThrow('Google Sheets error (HTTP 500).');

    const ok = stubFetch();
    await syncSheet();
    expect(ok).toHaveBeenCalledTimes(1);
    expect((await getApplications())[0]!.synced).toBe(true);

    await trackApplication('Analyst', 'https://acme.com/jobs/2', day); // sent, but the sheet is gone
    stubFetch(404);
    await trackApplication('Manager', 'https://acme.com/jobs/3', day);
    expect((await getSheet()).id).toBeUndefined();
    expect((await getApplications())[2]!.synced).toBeUndefined();
  });
});
