import { clean } from '../ats/field';
import { getApplications, getSheet, saveApplications } from '../storage/store';
import { appendRows } from './sheets';

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

/** Log an application once per URL, then try the sheet. A sheet failure keeps the row for the next sync. */
// shortcut: one row per page URL, so an application whose steps change the address logs a row per step;
// key on the ATS's job id per adapter when the duplicates get annoying.
export const trackApplication = (name: string, url: string, now = new Date()) => serial(async () => {
  const key = url.split('#')[0]!;
  if (!/^https?:\/\//i.test(key)) return; // the dashboard links to it
  const apps = await getApplications();
  if (!apps.some((a) => a.url === key)) {
    await saveApplications([...apps, { name: clean(name).slice(0, 200) || new URL(key).hostname, url: key, date: now.toLocaleDateString('en-CA') }]);
  }
  await sync().catch((e) => console.warn('[workday-filler] sheet not updated:', e));
});
