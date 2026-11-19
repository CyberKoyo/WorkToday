import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const html = readFileSync('entrypoints/tracker/index.html', 'utf8');
const titles = () => [...document.querySelectorAll('#rows tr')].map((tr) => tr.firstElementChild!.textContent);

beforeEach(async () => {
  fakeBrowser.reset();
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  await fakeBrowser.storage.local.set({ tracker: [
    { id: '1', title: 'SOC Analyst Intern', company: 'CME Group', date: '2026-07-01', salary: '', location: 'Chicago, IL', status: 'Rejected' },
    { id: '2', title: 'Cyber Defense Intern', company: 'CME Group', date: '2026-08-01', salary: '', location: 'Chicago, IL', status: 'Applied' },
    { id: '3', title: 'Data Analyst', company: 'Acme', date: '2026-09-01', salary: '', location: 'Boston, MA', status: 'Rejected' },
  ] });
  vi.resetModules();
  await import('../../entrypoints/tracker/main');
  await vi.waitFor(() => expect(titles()).toHaveLength(3));
});

describe('Applications log page', () => {
  it('search keeps the rows holding every word typed, in any field', async () => {
    const search = document.querySelector<HTMLInputElement>('#search')!;
    search.value = 'cme rejected';
    search.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(titles()).toEqual(['SOC Analyst Intern']));
    expect(document.querySelector('#count')!.textContent).toBe('1 of 3 match.');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(titles()).toEqual(['Data Analyst', 'Cyber Defense Intern', 'SOC Analyst Intern']));
  });
});
