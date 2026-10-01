import { PROFILE_KEYS, type MapRequest, type MapResponse, type ProfileKey } from '@wf/shared';

const KEYS = new Set<string>(PROFILE_KEYS);

export function sanitizeMappings(raw: unknown, req: MapRequest): MapResponse {
  const kindById = new Map(req.fields.map((f) => [f.id, f.kind]));
  const got = new Map<string, ProfileKey | null>();
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { mappings?: unknown }).mappings)
    ? (raw as { mappings: unknown[] }).mappings : [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const { id, profileKey } = m as { id?: unknown; profileKey?: unknown };
    if (typeof id !== 'string' || !kindById.has(id)) continue;
    if (got.has(id)) { got.set(id, null); continue; } // model contradicted itself → distrust
    let key: ProfileKey | null = typeof profileKey === 'string' && KEYS.has(profileKey) ? (profileKey as ProfileKey) : null;
    if (key && (kindById.get(id) === 'file') !== (key === 'resumeFile')) key = null;
    got.set(id, key);
  }
  return { mappings: req.fields.map((f) => ({ id: f.id, profileKey: got.get(f.id) ?? null })) };
}
