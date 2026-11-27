import { describe, expect, it } from 'vitest';
import { bucket, countThisWeek, perDay, statusCounts } from '../../src/popup/stats';
import type { Application } from '../../src/tracker/store';

const today = new Date(2026, 10, 24, 23, 30); // late evening: a UTC date would already be the 25th in the Americas
const app = (date: string, status = 'Applied'): Application => ({ id: date + status, title: 't', company: 'c', date, salary: '', location: '', status });

describe('popup stats', () => {
  it('this week covers today and the 6 days before, not day 7', () => {
    expect(countThisWeek([app('2026-11-24'), app('2026-11-18'), app('2026-11-17')], today)).toBe(2);
  });
  it('per-day series has 14 local days ending today', () => {
    const s = perDay([app('2026-11-24'), app('2026-11-24')], today);
    expect(s).toHaveLength(14);
    expect(s[13]).toEqual({ date: '2026-11-24', count: 2 });
    expect(s[0]?.date).toBe('2026-11-11');
  });
  it("folds the log's statuses into four", () => {
    expect(['Interview Scheduled', 'interview completed', 'Assessment', 'Withdrawn', '', 'offer'].map(bucket))
      .toEqual(['Interview', 'Interview', 'Applied', 'Applied', 'Applied', 'Offer']);
    expect(statusCounts([app('2026-11-24', ''), app('2026-11-24', 'Offer')])).toEqual({ Applied: 1, Interview: 0, Offer: 1, Rejected: 0 });
  });
});
