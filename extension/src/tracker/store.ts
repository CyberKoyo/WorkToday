import { browser } from 'wxt/browser';

export interface Application { id: string; title: string; company: string; date: string; salary: string; location: string; status: string }

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

export const getApplications = async (): Promise<Application[]> => { await moveTrackedRows(); return read(); };
export const saveApplications = (list: Application[]) => browser.storage.local.set({ [KEY]: list });

export const addApplications = async (list: Omit<Application, 'id'>[]) =>
  saveApplications([...(await getApplications()), ...list.map((a) => ({ ...a, id: crypto.randomUUID() }))]);
export const addApplication = (a: Omit<Application, 'id'>) => addApplications([a]);
export const updateApplication = async (a: Application) =>
  saveApplications((await getApplications()).map((x) => (x.id === a.id ? a : x)));
export const removeApplication = async (id: string) =>
  saveApplications((await getApplications()).filter((a) => a.id !== id));

// Local calendar day, in the form <input type="date"> takes.
export const today = () => new Date().toLocaleDateString('en-CA');
