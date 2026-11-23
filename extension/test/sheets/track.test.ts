import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { trackApplication, syncSheet } from '../../src/sheets/track';
import { getApplications, getSheet, saveSheet } from '../../src/storage/store';
import { HEADER } from '../../src/sheets/sheets';

const day = new Date(2026, 10, 13, 23, 30); // local time: late evening must still be the 13th
const connected = () => saveSheet({ id: 'S1', url: 'https://docs.google.com/spreadsheets/d/S1', token: 'T', expires: Date.now() + 3_600_000, cols: 4 });
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
      { name: 'Engineer - Acme', url: 'https://acme.com/jobs/1', date: '2026-11-13', at: day.getTime() },
      { name: 'acme.com', url: 'https://acme.com/jobs/2', date: '2026-11-13', at: day.getTime() },
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
    expect(JSON.parse(init.body)).toEqual({ values: [['=HYPERLINK("evil")', '2026-11-13', 'https://acme.com/jobs/1', '']] });
    expect(JSON.parse(f.mock.calls[1]![1].body).values).toEqual([['Analyst', '2026-11-13', 'https://acme.com/jobs/2', '']]);
    expect((await getApplications()).every((a) => a.synced)).toBe(true);
    await syncSheet();
    expect(f).toHaveBeenCalledTimes(2); // nothing waiting, nothing sent
  });

  it('keeps the company the page named', async () => {
    await trackApplication('Intern', 'https://cloudfitsoftware.applytojob.com/apply/1', day, undefined, 'CloudFit Software');
    expect((await getApplications())[0]!.company).toBe('CloudFit Software');
  });

  it('a sheet failure keeps the row for the next sync; a deleted sheet is forgotten', async () => {
    await connected();
    stubFetch(500);
    await trackApplication('Engineer', 'https://acme.com/jobs/1', day);
    expect(await getApplications()).toEqual([{ name: 'Engineer', url: 'https://acme.com/jobs/1', date: '2026-11-13', at: day.getTime() }]);
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

describe('one application at several addresses', () => {
  const rows = async () => (await getApplications()).map((a) => [a.url, a.seen ?? []]);
  const later = (min: number) => new Date(day.getTime() + min * 60_000);

  it('the next step of the same job is the same row', async () => {
    await trackApplication('Engineer', 'https://acme.wd1.myworkdayjobs.com/en-US/ext/job/Chicago/Engineer_R0012345/apply', day);
    await trackApplication('Engineer', 'https://acme.wd1.myworkdayjobs.com/en-US/ext/job/Chicago/Engineer_R0012345/apply/applyManually?step=2', later(5));
    await trackApplication('Engineer', 'https://apply.workable.com/acme/j/616F2D0286/', day);
    await trackApplication('Engineer', 'https://apply.workable.com/acme/j/616F2D0286/apply/', later(1));
    expect(await rows()).toEqual([
      ['https://acme.wd1.myworkdayjobs.com/en-US/ext/job/Chicago/Engineer_R0012345/apply', ['https://acme.wd1.myworkdayjobs.com/en-US/ext/job/Chicago/Engineer_R0012345/apply/applyManually?step=2']],
      ['https://apply.workable.com/acme/j/616F2D0286/', ['https://apply.workable.com/acme/j/616F2D0286/apply/']],
    ]);
    expect((await getApplications())[0]!.at).toBe(later(5).getTime());
  });

  it('a company page and its ATS share the job id', async () => {
    await trackApplication('Engineer', 'https://www.acme.com/careers/job?gh_jid=4567890', day);
    await trackApplication('Engineer', 'https://job-boards.greenhouse.io/acme/jobs/4567890', later(2));
    expect(await rows()).toEqual([['https://www.acme.com/careers/job?gh_jid=4567890', ['https://job-boards.greenhouse.io/acme/jobs/4567890']]]);
  });

  it('a site the last application led from is the same one, for two hours', async () => {
    await trackApplication('Engineer', 'https://paycomonline.net/v4/ats/web.php/portal/ffa4c5ee7003c56e6918c33281b4ad02/jobs/140389', day);
    await trackApplication('Engineer', 'https://careers.acme.com/apply/form', later(10), 'https://paycomonline.net/');
    await trackApplication('Analyst', 'https://careers.acme.com/apply/other', later(200), 'https://paycomonline.net/');
    expect((await rows()).map(([u]) => u)).toEqual([
      'https://paycomonline.net/v4/ats/web.php/portal/ffa4c5ee7003c56e6918c33281b4ad02/jobs/140389', 'https://careers.acme.com/apply/other']);
    expect((await getApplications())[0]!.seen).toEqual(['https://careers.acme.com/apply/form']);
  });

  it('different jobs stay apart: other ids, a shared portal hash, one path for every job', async () => {
    await trackApplication('A', 'https://paycomonline.net/v4/ats/web.php/portal/ffa4c5ee7003c56e6918c33281b4ad02/jobs/140389', day);
    await trackApplication('B', 'https://paycomonline.net/v4/ats/web.php/portal/ffa4c5ee7003c56e6918c33281b4ad02/jobs/140911', day);
    await trackApplication('C', 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=4368bc58-6c54-479e-b56b-f19037b54073&jobId=578942', day);
    await trackApplication('D', 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=4368bc58-6c54-479e-b56b-f19037b54073&jobId=578943', day);
    await trackApplication('E', 'https://apply.workable.com/acme/j/AAAA111111/apply/', day);
    await trackApplication('F', 'https://apply.workable.com/acme/j/BBBB222222/apply/', day, 'https://apply.workable.com/');
    expect((await getApplications()).map((a) => a.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('location', () => {
  const at = (where: Parameters<typeof trackApplication>[5], url = 'https://a.com/jobs/1') => trackApplication('A', url, day, undefined, undefined, where);

  it('keeps what the posting says; asks for a guess only for a new row without one', async () => {
    const guess = vi.fn().mockResolvedValue('Austin, TX (guessed)');
    await at({ location: ' Chicago,  IL ', guess });
    await at({ guess }, 'https://b.com/jobs/1');
    await at({ guess }, 'https://b.com/jobs/1');
    expect(guess).toHaveBeenCalledTimes(1);
    expect((await getApplications()).map((a) => a.location)).toEqual(['Chicago, IL', 'Austin, TX (guessed)']);
  });

  it('a row logged without one takes the first a later step finds; a failed guess still logs the row', async () => {
    await at({ guess: () => Promise.reject(new Error('Gemini free-tier limit hit.')) });
    expect((await getApplications())[0]!.location).toBeUndefined();
    await at({ location: 'Remote' });
    await at({ location: 'Elsewhere' });
    expect((await getApplications()).map((a) => a.location)).toEqual(['Remote']);
  });

  it('a sheet made before the Location column gets the longer header once, then rows with it', async () => {
    await saveSheet({ id: 'S1', token: 'T', expires: Date.now() + 3_600_000 });
    const f = stubFetch();
    await at({ location: 'Chicago, IL' });
    await at({}, 'https://b.com/jobs/1');
    const append = 'https://sheets.googleapis.com/v4/spreadsheets/S1/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
    expect(f.mock.calls.map(([u, i]) => `${i.method} ${u}`)).toEqual([
      'PUT https://sheets.googleapis.com/v4/spreadsheets/S1/values/A1:D1?valueInputOption=RAW', `POST ${append}`, `POST ${append}`]);
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ values: [HEADER] });
    expect(JSON.parse(f.mock.calls[1]![1].body).values).toEqual([['A', '2026-11-13', 'https://a.com/jobs/1', 'Chicago, IL']]);
    expect(JSON.parse(f.mock.calls[2]![1].body).values).toEqual([['A', '2026-11-13', 'https://b.com/jobs/1', '']]);
    expect((await getSheet()).cols).toBe(4);
  });
});
