import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import type { MapError } from './api/mapClient';
import type { Outcome } from './autofill/loop';

export type BgMessage = { type: 'map-fields'; fields: FieldDescriptor[] } | { type: 'answer-fields'; fields: FieldDescriptor[]; job?: string } | { type: 'open-options' } | { type: 'open-tracker'; title: string }
  | { type: 'track'; name: string; url: string; from?: string; company?: string } | { type: 'sync-sheet' }
  // Job loop, sent by the board's tab. `known`: every tab open before this job's Apply was clicked; `url`: a link for the background to open.
  | { type: 'loop-start' } | { type: 'loop-job'; known: number[]; url?: string };
/** `outcome` is missing when the job opened no tab (and on `loop-start`). */
export type LoopReply = { ok: true; known: number[]; outcome?: Outcome } | { ok: false; message: string };
/** The loop fills job sites it cannot know ahead of time; asked for on the dashboard, never at install. */
export const ALL_SITES = { origins: ['<all_urls>'] };
export type MapReply = { ok: true; mappings: Array<[string, ProfileKey | null]> } | { ok: false; code: MapError['code'] };
export type SyncReply = { ok: true } | { ok: false; message: string };
export type AnswerReply = { ok: true; answers: Array<[string, string[]]> } | { ok: false; message: string };
