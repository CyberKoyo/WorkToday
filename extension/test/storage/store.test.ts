import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getProfile, saveProfile, getApiKey, saveApiKey, getResume, saveResume, getMapCache, saveMapCache, MAP_CACHE_MAX } from '../../src/storage/store';
import { fileToStored, storedToFile } from '../../src/storage/fileCodec';
import { emptyProfile } from '../../src/profile/profile';

beforeEach(() => fakeBrowser.reset());

describe('store', () => {
  it('profile roundtrip; null when absent', async () => {
    expect(await getProfile()).toBeNull();
    const p = { ...emptyProfile(), firstName: 'Ada', reviewed: true };
    await saveProfile(p);
    expect(await getProfile()).toEqual(p);
  });
  it('api key defaults to empty string', async () => {
    expect(await getApiKey()).toBe('');
    await saveApiKey(' k1 ');
    expect(await getApiKey()).toBe('k1');
  });
  it('resume roundtrip', async () => {
    const s = { name: 'r.pdf', type: 'application/pdf', dataBase64: 'AAEC' };
    await saveResume(s);
    expect(await getResume()).toEqual(s);
  });
  it('map cache resets when over limit', async () => {
    const big = Object.fromEntries(Array.from({ length: MAP_CACHE_MAX + 1 }, (_, i) => [`k${i}`, 'email' as const]));
    await saveMapCache(big);
    expect(await getMapCache()).toEqual({});
  });
});

describe('fileCodec', () => {
  it('roundtrips binary content', async () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256);
    const f = new File([bytes], 'r.pdf', { type: 'application/pdf' });
    const back = storedToFile(await fileToStored(f));
    expect(back.name).toBe('r.pdf');
    expect(back.type).toBe('application/pdf');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });
});
