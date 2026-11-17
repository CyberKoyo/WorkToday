import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addApplication, getApplications, removeApplication, today } from '../../src/tracker/store';

beforeEach(() => fakeBrowser.reset());

describe('tracker store', () => {
  it('adds, lists and removes applications', async () => {
    expect(await getApplications()).toEqual([]);
    const a = { title: 'Security Intern', company: 'Acme', date: '2026-11-17', salary: '$30/hr', location: 'Boston, MA' };
    await addApplication(a);
    await addApplication({ ...a, company: 'Globex' });
    const [first, second] = await getApplications();
    expect(first).toMatchObject(a);
    expect(first!.id).not.toBe(second!.id);
    await removeApplication(first!.id);
    expect((await getApplications()).map((x) => x.company)).toEqual(['Globex']);
  });
  it('today is a local YYYY-MM-DD date', () => {
    const d = new Date();
    expect(today()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });
});
