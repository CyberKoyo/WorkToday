import { browser } from 'wxt/browser';
import type { ProfileKey } from '@wf/shared';
import { normalizeProfile, type Profile, type ProfileValue } from '../profile/profile';
import type { StoredFile } from './fileCodec';

const K = { profile: 'profile', apiKey: 'geminiApiKey', resume: 'resumeFile', mapCache: 'mapCache', answers: 'savedAnswers', apps: 'applications', sheet: 'sheet' } as const;
export const MAP_CACHE_MAX = 2000;

async function get<T>(key: string): Promise<T | undefined> {
  return (await browser.storage.local.get(key))[key] as T | undefined;
}
const set = (key: string, value: unknown) => browser.storage.local.set({ [key]: value });

export async function getProfile(): Promise<Profile | null> {
  const raw = await get<Profile>(K.profile);
  if (!raw) return null;
  return { ...normalizeProfile(raw), reviewed: raw.reviewed === true };
}
export const saveProfile = (p: Profile) => set(K.profile, p);

export const getApiKey = async () => (await get<string>(K.apiKey)) ?? '';
export const saveApiKey = (k: string) => set(K.apiKey, k.trim());

/** Every version of the resume the applicant added: Gemini reads them all. The first is the one attached to applications.
 * A resume stored before there was a list (under K.resume) counts as the list's only entry. */
export const getResumes = async (): Promise<StoredFile[]> =>
  (await get<StoredFile[]>('resumes')) ?? [await get<StoredFile>(K.resume)].filter((f): f is StoredFile => !!f);
export const saveResumes = async (list: StoredFile[]) => { await set('resumes', list); await browser.storage.local.remove(K.resume); };
export const getResume = async () => (await getResumes())[0] ?? null;

export const getMapCache = async () => (await get<Record<string, ProfileKey>>(K.mapCache)) ?? {};
export const saveMapCache = (c: Record<string, ProfileKey>) =>
  set(K.mapCache, Object.keys(c).length > MAP_CACHE_MAX ? {} : c);

/** One logged application. `synced`: its row is in the Google Sheet. */
export interface Application { name: string; url: string; date: string; synced?: boolean }
export const getApplications = async () => (await get<Application[]>(K.apps)) ?? [];
export const saveApplications = (a: Application[]) => set(K.apps, a);

/** The connected spreadsheet and the Google access token for it (valid until `expires`, ms). */
export interface Sheet { id?: string; url?: string; token?: string; expires?: number }
export const getSheet = async () => (await get<Sheet>(K.sheet)) ?? {};
export const saveSheet = (s: Sheet) => set(K.sheet, s);

/** Job loop: the login to use wherever an application wants an account, and whether the loop presses Submit itself.
 * shortcut: the password is stored as typed, like the API key above; move it behind a passphrase if this ships to others. */
export interface LoopSettings { email: string; password: string; submit: boolean }
export const getLoopSettings = async (): Promise<LoopSettings> => ({ email: '', password: '', submit: false, ...(await get<LoopSettings>('loop')) });
export const saveLoopSettings = (s: LoopSettings) => set('loop', s);

export const getSavedAnswers = async () => (await get<Record<string, ProfileValue>>(K.answers)) ?? {};
// One write at a time: two answers settling together would otherwise each overwrite the other's read.
let answerWrites: Promise<unknown> = Promise.resolve();
export const saveAnswer = (key: string, value: ProfileValue) =>
  (answerWrites = answerWrites.catch(() => {}).then(async () => set(K.answers, { ...(await getSavedAnswers()), [key]: value })));
