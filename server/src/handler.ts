import { validateMapRequest } from '@wf/shared';
import { buildMessages, RESPONSE_SCHEMA } from './prompt';
import { sanitizeMappings } from './sanitize';
import { privacyPage } from './privacy';

export interface Env {
  AI: { run(model: string, input: unknown): Promise<{ response?: unknown }> };
  LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /** One counter for all callers: caps model calls however many IPs they come from. Counted per Cloudflare location. */
  GLOBAL_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /** Optional KV namespace: a form seen before is answered without the model. Bind it only with the privacy policy updated
   * (the policy says the server keeps no record of requests). */
  MAP_CACHE?: { get(key: string, type: 'json'): Promise<unknown>; put(key: string, value: string, o: { expirationTtl: number }): Promise<void> };
  MODEL?: string;
}

// Browsers stamp an extension's requests with its own origin (checked live: Chrome sends chrome-extension://<id>, Firefox
// moz-extension://<per-install uuid>), and a web page cannot claim one. Stops websites from spending the model on their
// visitors' IPs, which the per-IP limit cannot see; a script can still forge the header, so the limits stay.
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/[\w-]+$/;
const CACHE_TTL_S = 30 * 86_400;
const digest = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const MAX_BODY_BYTES = 64_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export async function handle(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/health') return json({ ok: true });
  // The store listings link here.
  if (pathname === '/privacy') return new Response(privacyPage, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (pathname !== '/v1/map-fields') return json({ error: 'not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!EXTENSION_ORIGIN.test(request.headers.get('origin') ?? '')) return json({ error: 'forbidden' }, 403);

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'rate limited' }, 429);

  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413); // before reading it
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid JSON' }, 400); }
  const v = validateMapRequest(body);
  if (!v.ok) return json({ error: v.error }, 400);

  const model = env.MODEL || DEFAULT_MODEL;
  const key = env.MAP_CACHE ? await digest(`${model}\n${JSON.stringify(v.value)}`) : '';
  const hit = key ? await env.MAP_CACHE!.get(key, 'json').catch(() => null) : null;
  if (hit) return json(hit);
  if (env.GLOBAL_LIMITER && !(await env.GLOBAL_LIMITER.limit({ key: 'all' })).success) return json({ error: 'rate limited' }, 429);

  let raw: unknown;
  try {
    const out = await env.AI.run(model, {
      messages: buildMessages(v.value),
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      temperature: 0,
      max_tokens: 4096,
    });
    raw = typeof out.response === 'string' ? JSON.parse(out.response) : out.response;
  } catch (e) {
    console.error('model error', e);
    return json({ error: 'model error' }, 502);
  }
  const mapped = sanitizeMappings(raw, v.value);
  if (key) await env.MAP_CACHE!.put(key, JSON.stringify(mapped), { expirationTtl: CACHE_TTL_S }).catch(() => {}); // a miss next time, nothing worse
  return json(mapped);
}
