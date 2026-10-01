import type { FieldDescriptor, MapResponse, ProfileKey } from '@wf/shared';
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

  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/v1/map-fields`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: misses }),
    });
  } catch {
    throw new MapError('network', 'Could not reach the mapping service. Check your connection.');
  }
  if (res.status === 429) throw new MapError('rate_limited', 'Mapping service is busy. Try again in a minute.');
  if (!res.ok) throw new MapError('server', `Mapping service error (HTTP ${res.status}).`);
  let data: MapResponse;
  try { data = await res.json(); } catch { throw new MapError('bad_response', 'Mapping service returned an unreadable reply.'); }
  if (!Array.isArray(data?.mappings)) throw new MapError('bad_response', 'Mapping service returned an unreadable reply.');

  const byId = new Map(data.mappings.map((m) => [m.id, m.profileKey]));
  for (const f of misses) {
    const key = byId.get(f.id) ?? null;
    out.set(f.id, key);
    if (key) cache[cacheKey(f)] = key;
  }
  await saveMapCache(cache);
  return out;
}
