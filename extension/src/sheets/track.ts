import { clean } from '../ats/field';
import { getApplications, getSheet, saveApplications } from '../storage/store';
import { appendRows } from './sheets';
import { sameJob } from '../tracker/sameJob';

// One job at a time: two tabs logging together would otherwise each overwrite the other's read. Background only.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(job: () => Promise<T>): Promise<T> => (queue = queue.catch(() => {}).then(job)) as Promise<T>;

async function sync(): Promise<void> {
  if (!(await getSheet()).id) return;
  const apps = await getApplications();
  const rows = apps.filter((a) => !a.synced);
  if (!rows.length) return;
  await appendRows(rows);
  await saveApplications(apps.map((a) => ({ ...a, synced: true })));
}

/** Push the rows the Google Sheet does not have yet. Rejects with the reason when Google refuses. */
export const syncSheet = () => serial(sync);

const web = (u: string | undefined) => !!u && /^https?:\/\//i.test(u);
const HOP_MS = 2 * 3600_000;
const SEEN_MAX = 20;

/**
 * Log an application once, then try the sheet. A sheet failure keeps the row for the next sync. Filling it again at
 * another address adds that address to its row: the same job (sameJob), or a page reached from a site where an
 * application was filled in the last two hours (`from`, the page's referrer: the careers page's Apply led here).
 */
export const trackApplication = (name: string, url: string, now = new Date(), from?: string) => serial(async () => {
  const key = url.split('#')[0]!;
  if (!web(key)) return; // the dashboard links to it
  const apps = await getApplications();
  const addresses = (a: (typeof apps)[number]) => [a.url, ...(a.seen ?? [])];
  const origin = new URL(key).origin;
  const fromOrigin = web(from) ? new URL(from!).origin : '';
  let i = apps.findIndex((a) => addresses(a).some((k) => sameJob(k, key)));
  if (i < 0 && fromOrigin && fromOrigin !== origin) {
    const recent = apps.map((a, n) => [a, n] as const)
      .filter(([a]) => a.at && now.getTime() - a.at < HOP_MS && addresses(a).some((k) => new URL(k).origin === fromOrigin));
    i = recent.sort(([a], [b]) => b.at! - a.at!)[0]?.[1] ?? -1;
  }
  if (i < 0) {
    apps.push({ name: clean(name).slice(0, 200) || new URL(key).hostname, url: key, date: now.toLocaleDateString('en-CA'), at: now.getTime() });
  } else {
    const a = apps[i]!;
    apps[i] = { ...a, at: now.getTime(), ...(addresses(a).includes(key) ? {} : { seen: [...(a.seen ?? []), key].slice(-SEEN_MAX) }) };
  }
  await saveApplications(apps);
  await sync().catch((e) => console.warn('[workday-filler] sheet not updated:', e));
});
