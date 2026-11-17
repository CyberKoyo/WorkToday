import { browser } from 'wxt/browser';
import type { ProfileKey } from '@wf/shared';
import { normalizeProfile, type Profile, type ProfileValue } from '../profile/profile';
import type { StoredFile } from './fileCodec';

const K = { profile: 'profile', apiKey: 'geminiApiKey', resume: 'resumeFile', certProofs: 'certProofs', mapCache: 'mapCache', answers: 'savedAnswers', accountPassword: 'accountPassword', accountRefused: 'accountRefused' } as const;
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

// Kept apart from the profile (which goes to Gemini whole); never leaves this browser except into a site's own password box.
export const getAccountPassword = async () => (await get<string>(K.accountPassword)) ?? '';
// A new password is a new chance everywhere, so the refusals go with the old one.
export const saveAccountPassword = async (p: string) => { await set(K.accountPassword, p); await set(K.accountRefused, []); };
// Sites that refused the saved password. It is never sent there again: a few wrong tries lock the account (live Leidos).
export const getAccountRefused = async () => (await get<string[]>(K.accountRefused)) ?? [];
export const addAccountRefused = async (host: string) => set(K.accountRefused, [...new Set([...(await getAccountRefused()), host])]);

export const getResume = async () => (await get<StoredFile>(K.resume)) ?? null;
export const saveResume = (f: StoredFile) => set(K.resume, f);

// By certification name. Outside the profile, which goes to Gemini whole (answerQuestions).
export const getCertProofs = async () => (await get<Record<string, StoredFile>>(K.certProofs)) ?? {};
export const saveCertProofs = (p: Record<string, StoredFile>) => set(K.certProofs, p);

export const getMapCache = async () => (await get<Record<string, ProfileKey>>(K.mapCache)) ?? {};
export const saveMapCache = (c: Record<string, ProfileKey>) =>
  set(K.mapCache, Object.keys(c).length > MAP_CACHE_MAX ? {} : c);

export const getSavedAnswers = async () => (await get<Record<string, ProfileValue>>(K.answers)) ?? {};
// One write at a time: two answers settling together would otherwise each overwrite the other's read.
let answerWrites: Promise<unknown> = Promise.resolve();
export const saveAnswer = (key: string, value: ProfileValue) =>
  (answerWrites = answerWrites.catch(() => {}).then(async () => set(K.answers, { ...(await getSavedAnswers()), [key]: value })));
