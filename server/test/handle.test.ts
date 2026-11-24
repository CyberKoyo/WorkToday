import { describe, it, expect, vi } from 'vitest';
import { handle, type Env } from '../src/handler';
import type { MapResponse } from '@wf/shared';

const body = { fields: [{ id: 'wf-0', label: 'Email', kind: 'text', required: true }] };
const post = (b: unknown, path = '/v1/map-fields', origin: string | null = 'chrome-extension://gacapbfdlphgncbpcloffhblimnemnpl') =>
  new Request(`https://x${path}`, { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b),
    headers: { 'cf-connecting-ip': '1.2.3.4', ...(origin ? { origin } : {}) } });
const env = (over: Partial<Env> = {}): Env => ({
  AI: { run: vi.fn().mockResolvedValue({ response: { mappings: [{ id: 'wf-0', profileKey: 'email' }] } }) },
  LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
  ...over,
});

describe('handle', () => {
  it('serves the privacy policy as a page, escaped', async () => {
    const res = await handle(new Request('https://x/privacy'), env());
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain('<h1>Job Application Filler — Privacy Policy</h1>');
    expect(html).toContain('<strong>Google Gemini (under your own API key).</strong>');
    expect(html).toContain('<li>the resume files you add;</li>');
    expect(html).not.toContain('**');
  });
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
  it('answers only extensions: a web page or a bare script is refused before the model or the rate limit', async () => {
    const e = env();
    expect((await handle(post(body, undefined, 'moz-extension://22b13636-092a-4c86-bff7-fb8a5b5efe3c'), e)).status).toBe(200);
    for (const origin of ['https://evil.example', 'null', null, 'chrome-extension://x/../https://evil.example']) {
      expect((await handle(post(body, undefined, origin), e)).status).toBe(403);
    }
    expect(e.AI.run).toHaveBeenCalledTimes(1);
    expect(e.LIMITER.limit).toHaveBeenCalledTimes(1);
  });
  it('refuses a body announced as too big without reading it', async () => {
    const text = vi.fn();
    const req = { url: 'https://x/v1/map-fields', method: 'POST', text,
      headers: new Headers({ origin: 'chrome-extension://abc', 'content-length': '10000000' }) } as unknown as Request;
    expect((await handle(req, env())).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
  });
  it('stops calling the model when every caller together is over the global limit', async () => {
    const e = env({ GLOBAL_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } });
    expect((await handle(post(body), e)).status).toBe(429);
    expect(e.GLOBAL_LIMITER!.limit).toHaveBeenCalledWith({ key: 'all' });
    expect(e.AI.run).not.toHaveBeenCalled();
  });
  it('with a cache bound, answers a form seen before without the model or the global limit', async () => {
    const kv = new Map<string, string>();
    const MAP_CACHE = { get: vi.fn(async (k: string) => (kv.has(k) ? JSON.parse(kv.get(k)!) : null)), put: vi.fn(async (k: string, v: string) => { kv.set(k, v); }) };
    const e = env({ MAP_CACHE, GLOBAL_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) } });
    const first = await (await handle(post(body), e)).json();
    const again = await (await handle(post(body), e)).json();
    expect(again).toEqual(first);
    expect(e.AI.run).toHaveBeenCalledTimes(1);
    expect(e.GLOBAL_LIMITER!.limit).toHaveBeenCalledTimes(1);
    expect(MAP_CACHE.put).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/), JSON.stringify(first), { expirationTtl: 30 * 86_400 });
  });
  it('health', async () => {
    expect((await handle(new Request('https://x/health'), env())).status).toBe(200);
  });
});

describe('markdownToHtml', () => {
  it('escapes markup and joins wrapped lines', async () => {
    const { markdownToHtml } = await import('../src/privacy');
    expect(markdownToHtml('## A <b>\n\none\ntwo **x**\n\n- a\n  b\n- c')).toBe('<h2>A &lt;b&gt;</h2>\n<p>one two <strong>x</strong></p>\n<ul><li>a b</li><li>c</li></ul>');
  });
});
