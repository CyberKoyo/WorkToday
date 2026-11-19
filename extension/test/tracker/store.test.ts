import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addApplication, getApplications, removeApplication, today } from '../../src/tracker/store';
import { getApplications as getLogged } from '../../src/storage/store';

beforeEach(() => fakeBrowser.reset());

describe('tracker store', () => {
  it('adds, lists and removes applications', async () => {
    expect(await getApplications()).toEqual([]);
    const a = { title: 'Security Intern', company: 'Acme', date: '2026-11-17', salary: '$30/hr', location: 'Boston, MA', status: 'Applied' };
    await addApplication(a);
    await addApplication({ ...a, company: 'Globex' });
    const [first, second] = await getApplications();
    expect(first).toMatchObject(a);
    expect(first!.id).not.toBe(second!.id);
    await removeApplication(first!.id);
    expect((await getApplications()).map((x) => x.company)).toEqual(['Globex']);
  });
  it('moves tracker rows out of the auto-logged list, where they broke the dashboard', async () => {
    const tracked = { id: 't1', title: 'Analyst', company: 'Acme', date: '2026-11-01', salary: '', location: '', status: 'Applied' };
    const logged = { name: 'Engineer at Globex', url: 'https://globex.example/jobs/1', date: '2026-11-02' };
    await fakeBrowser.storage.local.set({ applications: [logged, tracked] });
    expect(await getLogged()).toEqual([logged]);
    expect(await getApplications()).toEqual([tracked]);
    expect(await getApplications()).toEqual([tracked]); // once, no duplicate
  });
  it('today is a local YYYY-MM-DD date', () => {
    const d = new Date();
    expect(today()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });
});
