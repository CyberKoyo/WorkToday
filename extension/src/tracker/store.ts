import { browser } from 'wxt/browser';
import { companyFromUrl } from './company';

/** url: the page Auto-fill logged it from (rows copied from the auto-logged list). */
export interface Application { id: string; title: string; company: string; date: string; salary: string; location: string; status: string; url?: string }

const KEY = 'tracker';
const LOGGED = 'applications'; // the auto-logged list ({name, url, date}); see storage/store

const read = async (): Promise<Application[]> => ((await browser.storage.local.get(KEY))[KEY] as Application[] | undefined) ?? [];

/** Tracker rows were once kept under the auto-logged list's key, where the dashboard broke on them (no url): move them here. */
export async function moveTrackedRows(): Promise<void> {
  const old = ((await browser.storage.local.get(LOGGED))[LOGGED] as Array<Partial<Application> & { url?: string }> | undefined) ?? [];
  const tracked = old.filter((a) => !a.url);
  if (!tracked.length) return;
  const have = await read();
  const ids = new Set(have.map((a) => a.id));
  // Tracker first: a run cut off between the two writes is redone without duplicates (by id), never loses a row.
  await browser.storage.local.set({ [KEY]: [...have, ...(tracked as Application[]).filter((a) => !ids.has(a.id))] });
  await browser.storage.local.set({ [LOGGED]: old.filter((a) => a.url) });
}

const COPIED = 'trackerCopied'; // addresses already copied in: a row deleted from the log stays deleted

/** Copy each application Auto-fill logged into this list once, where it can be edited. */
export async function copyLogged(): Promise<void> {
  const logged = ((await browser.storage.local.get(LOGGED))[LOGGED] as Array<{ name: string; url: string; date: string }> | undefined) ?? [];
  const copied = new Set(((await browser.storage.local.get(COPIED))[COPIED] as string[] | undefined) ?? []);
  const fresh = logged.filter((a) => a.url && !copied.has(a.url));
  if (!fresh.length) return;
  const have = await read();
  const urls = new Set(have.map((a) => a.url));
  // Rows first: a run cut off before the second write is redone without duplicates (by url).
  await browser.storage.local.set({ [KEY]: [...have, ...fresh.filter((a) => !urls.has(a.url)).map((a) => ({
    id: crypto.randomUUID(), title: a.name, company: companyFromUrl(a.url), date: a.date, salary: '', location: '', status: 'Applied', url: a.url }))] });
  await browser.storage.local.set({ [COPIED]: [...copied, ...fresh.map((a) => a.url)] });
}

export const getApplications = async (): Promise<Application[]> => { await moveTrackedRows(); await copyLogged(); return read(); };
export const saveApplications = (list: Application[]) => browser.storage.local.set({ [KEY]: list });

export const addApplications = async (list: Omit<Application, 'id'>[]) =>
  saveApplications([...(await getApplications()), ...list.map((a) => ({ ...a, id: crypto.randomUUID() }))]);
export const addApplication = (a: Omit<Application, 'id'>) => addApplications([a]);
export const updateApplication = async (a: Application) =>
  saveApplications((await getApplications()).map((x) => (x.id === a.id ? { ...x, ...a } : x))); // keeps the url the form has no field for
export const removeApplication = async (id: string) =>
  saveApplications((await getApplications()).filter((a) => a.id !== id));

// Local calendar day, in the form <input type="date"> takes.
export const today = () => new Date().toLocaleDateString('en-CA');
