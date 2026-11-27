import { describe, it, expect } from 'vitest';
import { alreadyApplied, likelyApplied } from '../../src/tracker/seen';

const CME = 'https://cmegroup.wd1.myworkdayjobs.com/en-US/cme_careers/job/Chicago/Cyber-Defense-Response-Intern_35062-1/apply';

describe('likelyApplied', () => {
  it('same company, the closer title first; other companies left out', () => {
    const tracked = [
      { title: 'Software Engineering Intern', company: 'CME Group', date: '2026-01-05', status: 'Rejected' },
      { title: 'Cyber Defense Intern', company: 'CME Group', date: '2025-10-01', status: 'Applied' },
      { title: 'Cyber Defense Response Intern', company: 'Globex', date: '2026-02-01', status: 'Applied' },
    ];
    expect(likelyApplied('Cyber Defense Response Intern - Summer 2026', CME, '2026-11-19', [], tracked).map((s) => s.title))
      .toEqual(['Cyber Defense Intern', 'Software Engineering Intern']);
  });
  it("this visit's own logged row is not a past application; an older one at that address is", () => {
    const row = { name: 'Cyber Defense Response Intern', url: CME, date: '2026-11-19' };
    expect(likelyApplied('Cyber Defense Response Intern', CME, '2026-11-19', [row], [])).toEqual([]);
    expect(likelyApplied('Cyber Defense Response Intern', CME, '2026-11-20', [row], [])).toHaveLength(1);
  });
  it('nor is it on a later step of the same application, logged under the first address', () => {
    const row = { name: 'Cyber Defense Response Intern', url: 'https://www.cmegroup.com/careers/1', date: '2026-11-19', seen: [CME] };
    expect(likelyApplied('Cyber Defense Response Intern', CME, '2026-11-19', [row], [])).toEqual([]);
  });
  it('a logged row copied into the log counts once, with the status typed there; this visit\'s copy not at all', () => {
    const row = { name: 'Cyber Defense Response Intern', url: CME, date: '2026-11-19' };
    const copy = { title: 'Cyber Defense Response Intern', company: 'CME Group', date: '2026-11-19', status: 'Rejected', url: CME };
    expect(likelyApplied('Cyber Defense Response Intern', CME, '2026-11-19', [row], [copy])).toEqual([]);
    expect(likelyApplied('Cyber Defense Response Intern', CME, '2026-11-20', [row], [copy]).map((s) => s.status)).toEqual(['Rejected']);
  });
  it('an address with no company: only a near word-for-word title', () => {
    const url = 'https://eofe.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1/apply';
    const tracked = [{ title: 'SOC Analyst Intern', company: 'Tenet', date: '2026-03-01' }, { title: 'Data Analyst', company: 'Acme', date: '2026-03-02' }];
    expect(likelyApplied('SOC Analyst Intern - Tenet Careers', url, '2026-11-19', [], tracked).map((s) => s.title)).toEqual(['SOC Analyst Intern']);
  });
});

describe('alreadyApplied', () => {
  const T = 'Cyber Defense Response Intern - CME Group';
  const since = Date.UTC(2026, 10, 27);
  it('the same job by address, or the same company under nearly the same title', () => {
    expect(alreadyApplied('Anything', `${CME}#top`, since, [{ name: 'x', url: CME, at: since - 1 }], [])).toBe(true);
    expect(alreadyApplied(T, CME, since, [], [{ title: 'Cyber Defense Response Intern - CME Group', company: 'CME Group' }])).toBe(true);
  });
  it('not another role at the same company, nor the same title elsewhere', () => {
    expect(alreadyApplied(T, CME, since, [], [{ title: 'Cyber Defense Intern', company: 'CME Group' }])).toBe(false);
    expect(alreadyApplied(T, CME, since, [], [{ title: 'Software Engineering Intern', company: 'CME Group' }])).toBe(false);
    expect(alreadyApplied(T, CME, since, [], [{ title: T, company: 'Globex' }])).toBe(false);
  });
  it("this job's own rows (logged since it opened, and their copies) do not count", () => {
    const own = { name: T, url: CME, at: since + 5 };
    expect(alreadyApplied(T, CME, since, [own], [{ title: T, company: 'CME Group', url: CME }])).toBe(false);
  });
});
