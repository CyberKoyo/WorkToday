import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import type { MapError } from './api/mapClient';

export type BgMessage = { type: 'map-fields'; fields: FieldDescriptor[] } | { type: 'open-options' };
export type MapReply = { ok: true; mappings: Array<[string, ProfileKey | null]> } | { ok: false; code: MapError['code'] };
