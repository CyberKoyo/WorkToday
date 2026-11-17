import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import type { MapError } from './api/mapClient';

export type BgMessage = { type: 'map-fields'; fields: FieldDescriptor[] } | { type: 'answer-fields'; fields: FieldDescriptor[] } | { type: 'open-options' } | { type: 'open-tracker'; title: string };
export type MapReply = { ok: true; mappings: Array<[string, ProfileKey | null]> } | { ok: false; code: MapError['code'] };
export type AnswerReply = { ok: true; answers: Array<[string, string[]]> } | { ok: false; message: string };
