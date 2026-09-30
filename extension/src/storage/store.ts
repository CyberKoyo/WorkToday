import { browser } from 'wxt/browser';
import type { ProfileKey } from '@wf/shared';
import { normalizeProfile, type Profile } from '../profile/profile';
import type { StoredFile } from './fileCodec';

const K = { profile: 'profile', apiKey: 'geminiApiKey', resume: 'resumeFile', mapCache: 'mapCache' } as const;
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

export const getResume = async () => (await get<StoredFile>(K.resume)) ?? null;
export const saveResume = (f: StoredFile) => set(K.resume, f);

export const getMapCache = async () => (await get<Record<string, ProfileKey>>(K.mapCache)) ?? {};
export const saveMapCache = (c: Record<string, ProfileKey>) =>
  set(K.mapCache, Object.keys(c).length > MAP_CACHE_MAX ? {} : c);
