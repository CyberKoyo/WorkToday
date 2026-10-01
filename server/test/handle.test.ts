import { describe, it, expect, vi } from 'vitest';
import { handle, type Env } from '../src/index';
import type { MapResponse } from '@wf/shared';

const body = { fields: [{ id: 'wf-0', label: 'Email', kind: 'text', required: true }] };
const post = (b: unknown, path = '/v1/map-fields') =>
  new Request(`https://x${path}`, { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: { 'cf-connecting-ip': '1.2.3.4' } });
const env = (over: Partial<Env> = {}): Env => ({
  AI: { run: vi.fn().mockResolvedValue({ response: { mappings: [{ id: 'wf-0', profileKey: 'email' }] } }) },
  LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
  ...over,
});

describe('handle', () => {
  it('maps fields', async () => {
    const e = env();
    const res = await handle(post(body), e);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mappings: [{ id: 'wf-0', profileKey: 'email' }] });
    expect(e.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct-fast', expect.objectContaining({ temperature: 0 }));
    expect(e.LIMITER.limit).toHaveBeenCalledWith({ key: '1.2.3.4' });
  });
  it('accepts string model response', async () => {
    const e = env({ AI: { run: vi.fn().mockResolvedValue({ response: '{"mappings":[{"id":"wf-0","profileKey":"email"}]}' }) } });
    expect(((await (await handle(post(body), e)).json()) as MapResponse).mappings[0].profileKey).toBe('email');
  });
  it('uses MODEL override', async () => {
    const e = env({ MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' });
    await handle(post(body), e);
    expect(e.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3.3-70b-instruct-fp8-fast', expect.anything());
  });
  it.each([
    ['rate limited', () => handle(post(body), env({ LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } })), 429],
    ['bad json', () => handle(post('{nope'), env()), 400],
    ['invalid body', () => handle(post({ fields: [] }), env()), 400],
    ['too big', () => handle(post('x'.repeat(64_001)), env()), 413],
    ['wrong path', () => handle(post(body, '/other'), env()), 404],
    ['wrong method', () => handle(new Request('https://x/v1/map-fields'), env()), 405],
    ['model throws', () => handle(post(body), env({ AI: { run: vi.fn().mockRejectedValue(new Error('x')) } })), 502],
    ['model returns non-JSON string', () => handle(post(body), env({ AI: { run: vi.fn().mockResolvedValue({ response: 'hi' }) } })), 502],
  ])('%s', async (_n, call, status) => {
    expect((await call()).status).toBe(status);
  });
  it('health', async () => {
    expect((await handle(new Request('https://x/health'), env())).status).toBe(200);
  });
});
