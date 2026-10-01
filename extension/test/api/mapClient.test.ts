import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mapFields, MapError, cacheKey } from '../../src/api/mapClient';
import { DEFAULT_API_BASE } from '../../src/api/apiBase';
import { getMapCache, saveMapCache } from '../../src/storage/store';
import type { FieldDescriptor } from '@wf/shared';

const F = (id: string, label: string, section?: string): FieldDescriptor => ({ id, label, kind: 'text', required: false, ...(section ? { section } : {}) });
const reply = (mappings: unknown) => new Response(JSON.stringify({ mappings }), { status: 200 });

beforeEach(() => fakeBrowser.reset());

describe('mapFields', () => {
  it('calls server for misses and caches non-null results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ id: 'wf-0', profileKey: 'email' }, { id: 'wf-1', profileKey: null }]));
    const out = await mapFields([F('wf-0', 'Email*'), F('wf-1', 'Favourite colour')], { fetchImpl, apiBase: 'https://api' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api/v1/map-fields', expect.objectContaining({ method: 'POST' }));
    expect(out.get('wf-0')).toBe('email');
    expect(out.get('wf-1')).toBeNull();
    expect(Object.values(await getMapCache())).toEqual(['email']);
  });
  it('full cache hit makes no request (works offline); ids re-keyed', async () => {
    await saveMapCache({ [cacheKey(F('x', 'Email'))]: 'email' });
    const fetchImpl = vi.fn();
    const out = await mapFields([F('wf-7', 'Email')], { fetchImpl, apiBase: 'https://api' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.get('wf-7')).toBe('email');
  });
  it('cache key ignores group number so Work Experience 2 reuses 1', () => {
    expect(cacheKey(F('a', 'Job Title', 'Work Experience 1'))).toBe(cacheKey(F('b', 'Job Title*', 'Work Experience 2')));
  });
  it('only sends misses', async () => {
    await saveMapCache({ [cacheKey(F('x', 'Email'))]: 'email' });
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ id: 'wf-1', profileKey: 'city' }]));
    await mapFields([F('wf-0', 'Email'), F('wf-1', 'City')], { fetchImpl, apiBase: 'https://api' });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).fields.map((f: FieldDescriptor) => f.id)).toEqual(['wf-1']);
  });
  it('defaults to the deployed Worker when no apiBase or env is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ id: 'wf-0', profileKey: 'email' }]));
    await mapFields([F('wf-0', 'Email')], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_API_BASE}/v1/map-fields`, expect.anything());
  });
  it.each([
    [() => Promise.resolve(new Response('{}', { status: 429 })), 'rate_limited'],
    [() => Promise.resolve(new Response('{}', { status: 502 })), 'server'],
    [() => Promise.reject(new TypeError('offline')), 'network'],
    [() => Promise.resolve(new Response('nope', { status: 200 })), 'bad_response'],
  ])('errors -> %s', async (impl, code) => {
    const fetchImpl = vi.fn().mockImplementation(impl);
    await expect(mapFields([F('wf-0', 'Email')], { fetchImpl, apiBase: 'https://api' })).rejects.toMatchObject({ code });
  });
  it('error rejections are MapError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error());
    await expect(mapFields([F('wf-0', 'E')], { fetchImpl, apiBase: 'https://api' })).rejects.toBeInstanceOf(MapError);
  });
});
