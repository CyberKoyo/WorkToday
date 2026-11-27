import type { Application } from '../tracker/store';

export const BUCKETS = ['Applied', 'Interview', 'Offer', 'Rejected'] as const;
export type Bucket = (typeof BUCKETS)[number];

// Local calendar days, the form the tracker stores dates in (store.ts `today`).
export const daysAgo = (today: Date, n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n).toLocaleDateString('en-CA');

/** Applications dated within the 7 days ending today (today included). */
export function countThisWeek(apps: Application[], today: Date): number {
  const from = daysAgo(today, 6), to = daysAgo(today, 0);
  return apps.filter((a) => a.date >= from && a.date <= to).length;
}

/** Counts per day for the last `days` days, oldest first. */
export const perDay = (apps: Application[], today: Date, days = 14) =>
  Array.from({ length: days }, (_, i) => {
    const date = daysAgo(today, days - 1 - i);
    return { date, count: apps.filter((a) => a.date === date).length };
  });

/** The log's longer statuses fold in: "Interview Scheduled" is an Interview; Assessment, Withdrawn, none or unknown count as Applied. */
export const bucket = (status: string | undefined): Bucket =>
  /^interview/i.test(status ?? '') ? 'Interview' : (BUCKETS.find((b) => b.toLowerCase() === status?.trim().toLowerCase()) ?? 'Applied');

export function statusCounts(apps: Application[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { Applied: 0, Interview: 0, Offer: 0, Rejected: 0 };
  for (const a of apps) out[bucket(a.status)]++;
  return out;
}

export const recent = (apps: Application[], n = 5) => [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
