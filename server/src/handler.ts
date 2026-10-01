import { validateMapRequest } from '@wf/shared';
import { buildMessages, RESPONSE_SCHEMA } from './prompt';
import { sanitizeMappings } from './sanitize';

export interface Env {
  AI: { run(model: string, input: unknown): Promise<{ response?: unknown }> };
  LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  MODEL?: string;
}

export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const MAX_BODY_BYTES = 64_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export async function handle(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/health') return json({ ok: true });
  if (pathname !== '/v1/map-fields') return json({ error: 'not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'rate limited' }, 429);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid JSON' }, 400); }
  const v = validateMapRequest(body);
  if (!v.ok) return json({ error: v.error }, 400);

  let raw: unknown;
  try {
    const out = await env.AI.run(env.MODEL || DEFAULT_MODEL, {
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
  return json(sanitizeMappings(raw, v.value));
}
