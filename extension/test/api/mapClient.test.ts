import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mapFields, MapError, cacheKey } from '../../src/api/mapClient';
import { DEFAULT_API_BASE } from '../../src/api/apiBase';
import { getMapCache, saveMapCache } from '../../src/storage/store';
import { MAX_FIELDS, MAX_LABEL_LEN, MAX_OPTIONS, type FieldDescriptor } from '@wf/shared';

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
  it('labels in other scripts get their own keys; a label of symbols is never cached', async () => {
    expect(cacheKey(F('a', '氏名'))).not.toBe(cacheKey(F('b', '電話番号')));
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ id: 'wf-0', profileKey: 'email' }, { id: 'wf-1', profileKey: 'phone' }]));
    const out = await mapFields([F('wf-0', '***'), F('wf-1', '—')], { fetchImpl, apiBase: 'https://api' });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).fields).toHaveLength(2); // asked apart, not as one label
    expect(out.get('wf-1')).toBe('phone');
    expect(await getMapCache()).toEqual({});
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
  it('trims fields to the server limits (long legal labels, many options)', async () => {
    const long = 'x'.repeat(400);
    const fetchImpl = vi.fn().mockResolvedValue(reply([]));
    await mapFields([{ id: 'wf-0', label: long, kind: 'radio', required: true, section: long, options: Array.from({ length: 70 }, () => long) }],
      { fetchImpl, apiBase: 'https://api' });
    const [sent] = JSON.parse(fetchImpl.mock.calls[0]![1].body).fields;
    expect(sent.label).toHaveLength(MAX_LABEL_LEN);
    expect(sent.section).toHaveLength(MAX_LABEL_LEN);
    expect(sent.options).toHaveLength(MAX_OPTIONS);
    expect(sent.options.every((o: string) => o.length === MAX_LABEL_LEN)).toBe(true);
  });
  it('splits large pages into requests within the field and size limits', async () => {
    const fields = Array.from({ length: 100 }, (_, i) => ({ ...F(`wf-${i}`, `Question ${i}`), kind: 'radio' as const,
      options: Array.from({ length: 20 }, (_, j) => `option ${j} `.padEnd(200, '.')) }));
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      reply(JSON.parse(init.body as string).fields.map((f: FieldDescriptor) => ({ id: f.id, profileKey: 'city' }))));
    const out = await mapFields(fields, { fetchImpl: fetchImpl as never, apiBase: 'https://api' });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchImpl.mock.calls) {
      expect((init.body as string).length).toBeLessThanOrEqual(64_000);
      expect(JSON.parse(init.body as string).fields.length).toBeLessThanOrEqual(MAX_FIELDS);
    }
    expect([...out.values()].every((k) => k === 'city')).toBe(true);
    expect(out.size).toBe(100);
  });
  it('sends a repeated label once and applies the answer to every copy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ id: 'wf-0', profileKey: 'work.title' }]));
    const out = await mapFields([F('wf-0', 'Job Title', 'Work Experience 1'), F('wf-5', 'Job Title*', 'Work Experience 2')],
      { fetchImpl, apiBase: 'https://api' });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).fields).toHaveLength(1);
    expect(out.get('wf-5')).toBe('work.title');
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
