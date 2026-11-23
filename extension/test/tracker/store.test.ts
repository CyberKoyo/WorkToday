import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addApplication, getApplications, removeApplication, today, updateApplication } from '../../src/tracker/store';
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
    expect((await getApplications())[0]).toEqual(tracked);
    expect((await getApplications()).filter((a) => a.id === 't1')).toHaveLength(1); // once, no duplicate
  });
  it('copies what Auto-fill logged into the log once, to edit; a deleted copy stays deleted', async () => {
    await fakeBrowser.storage.local.set({ applications: [{ name: 'Engineer', url: 'https://jobs.lever.co/globex/1', date: '2026-11-02' }] });
    const [copy] = await getApplications();
    expect(copy).toMatchObject({ title: 'Engineer', company: 'Globex', date: '2026-11-02', status: 'Applied', url: 'https://jobs.lever.co/globex/1' });
    expect(await getApplications()).toHaveLength(1);
    const { url: _, ...edited } = { ...copy!, status: 'Rejected' }; // the log's form has no url field
    await updateApplication(edited);
    expect((await getApplications())[0]).toMatchObject({ status: 'Rejected', url: 'https://jobs.lever.co/globex/1' });
    await removeApplication(copy!.id);
    expect(await getApplications()).toEqual([]);
  });
  it('today is a local YYYY-MM-DD date', () => {
    const d = new Date();
    expect(today()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });
});
