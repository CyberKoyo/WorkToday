import { browser } from 'wxt/browser';

export interface Application { id: string; title: string; company: string; date: string; salary: string; location: string }

const KEY = 'applications';

export const getApplications = async (): Promise<Application[]> =>
  ((await browser.storage.local.get(KEY))[KEY] as Application[] | undefined) ?? [];
const save = (list: Application[]) => browser.storage.local.set({ [KEY]: list });

export const addApplications = async (list: Omit<Application, 'id'>[]) =>
  save([...(await getApplications()), ...list.map((a) => ({ ...a, id: crypto.randomUUID() }))]);
export const addApplication = (a: Omit<Application, 'id'>) => addApplications([a]);
export const updateApplication = async (a: Application) =>
  save((await getApplications()).map((x) => (x.id === a.id ? a : x)));
export const removeApplication = async (id: string) =>
  save((await getApplications()).filter((a) => a.id !== id));

// Local calendar day, in the form <input type="date"> takes.
export const today = () => new Date().toLocaleDateString('en-CA');
