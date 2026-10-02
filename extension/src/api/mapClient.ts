import { MAX_FIELDS, MAX_LABEL_LEN, MAX_OPTIONS, type FieldDescriptor, type MapResponse, type ProfileKey } from '@wf/shared';
import { getMapCache, saveMapCache } from '../storage/store';
import { norm } from '../fill/matchOption';
import { DEFAULT_API_BASE } from './apiBase';

type Code = 'rate_limited' | 'server' | 'network' | 'bad_response';
export class MapError extends Error {
  constructor(public code: Code, message: string) { super(message); this.name = 'MapError'; }
}

export function cacheKey(f: FieldDescriptor): string {
  const section = norm((f.section ?? '').replace(/\d+\s*$/, ''));
  return `${f.kind}|${section}|${norm(f.label)}`;
}

// Server rejects bodies over 64_000 chars; leave headroom for the JSON envelope.
const MAX_BODY_CHARS = 60_000;

const clip = (s: string) => s.slice(0, MAX_LABEL_LEN);

/** The descriptor as the server accepts it: long legal labels and option lists are trimmed. */
function forWire(f: FieldDescriptor): FieldDescriptor {
  const d: FieldDescriptor = { id: f.id, label: clip(f.label), kind: f.kind, required: f.required };
  if (f.options) d.options = f.options.slice(0, MAX_OPTIONS).map(clip);
  if (f.section) d.section = clip(f.section);
  return d;
}

/** Split into requests within the server's field-count and body-size limits. */
function batches(fields: FieldDescriptor[]): FieldDescriptor[][] {
  const out: FieldDescriptor[][] = [];
  let cur: FieldDescriptor[] = [];
  let size = 0;
  for (const f of fields) {
    const len = JSON.stringify(f).length + 1;
    if (cur.length && (cur.length >= MAX_FIELDS || size + len > MAX_BODY_CHARS)) { out.push(cur); cur = []; size = 0; }
    cur.push(f);
    size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function request(fetchImpl: typeof fetch, apiBase: string, fields: FieldDescriptor[]): Promise<MapResponse> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/v1/map-fields`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields }),
    });
  } catch {
    throw new MapError('network', 'Could not reach the mapping service. Check your connection.');
  }
  if (res.status === 429) throw new MapError('rate_limited', 'Mapping service is busy. Try again in a minute.');
  if (!res.ok) throw new MapError('server', `Mapping service error (HTTP ${res.status}).`);
  let data: MapResponse;
  try { data = await res.json(); } catch { throw new MapError('bad_response', 'Mapping service returned an unreadable reply.'); }
  if (!Array.isArray(data?.mappings)) throw new MapError('bad_response', 'Mapping service returned an unreadable reply.');
  return data;
}

export async function mapFields(
  fields: FieldDescriptor[],
  opts: { fetchImpl?: typeof fetch; apiBase?: string } = {},
): Promise<Map<string, ProfileKey | null>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiBase = opts.apiBase ?? (import.meta.env.WXT_API_BASE || DEFAULT_API_BASE);
  const cache = await getMapCache();
  const out = new Map<string, ProfileKey | null>();
  const misses: FieldDescriptor[] = [];
  for (const f of fields) {
    const hit = cache[cacheKey(f)];
    if (hit) out.set(f.id, hit); else misses.push(f);
  }
  if (!misses.length) return out;

  // A label repeated across groups (Job Title in Work Experience 1..n) is asked once.
  const reps = new Map<string, FieldDescriptor>();
  for (const f of misses) if (!reps.has(cacheKey(f))) reps.set(cacheKey(f), f);
  const byId = new Map<string, ProfileKey | null>();
  for (const batch of batches([...reps.values()].map(forWire))) {
    for (const m of (await request(fetchImpl, apiBase, batch)).mappings) byId.set(m.id, m.profileKey);
  }

  for (const f of misses) {
    const key = byId.get(reps.get(cacheKey(f))!.id) ?? null;
    out.set(f.id, key);
    if (key) cache[cacheKey(f)] = key;
  }
  await saveMapCache(cache);
  return out;
}
