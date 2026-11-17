import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getProfile, saveProfile, getApiKey, saveApiKey, getResume, getResumes, saveResumes, getMapCache, saveMapCache, MAP_CACHE_MAX, getSavedAnswers, saveAnswer } from '../../src/storage/store';
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
  it('resumes roundtrip: the first is the one attached; a resume stored before there was a list is kept', async () => {
    const s = { name: 'r.pdf', type: 'application/pdf', dataBase64: 'AAEC' };
    const t = { name: 'r-data.pdf', type: 'application/pdf', dataBase64: 'AAED' };
    expect(await getResumes()).toEqual([]);
    expect(await getResume()).toBeNull();
    await fakeBrowser.storage.local.set({ resumeFile: s }); // as earlier versions stored it
    expect(await getResumes()).toEqual([s]);
    await saveResumes([t, s]);
    expect(await getResumes()).toEqual([t, s]);
    expect(await getResume()).toEqual(t);
    expect(await fakeBrowser.storage.local.get('resumeFile')).toEqual({}); // not kept twice
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
  it('saved answers: answers saved together are all kept', async () => {
    expect(await getSavedAnswers()).toEqual({});
    await Promise.all([saveAnswer('radio|a', 'Yes'), saveAnswer('checkbox|b', ['LinkedIn']), saveAnswer('text|c', '4')]);
    expect(await getSavedAnswers()).toEqual({ 'radio|a': 'Yes', 'checkbox|b': ['LinkedIn'], 'text|c': '4' });
  });
});
