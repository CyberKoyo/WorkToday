import type { FieldDescriptor } from '@wf/shared';

// members: a radio/checkbox group's own controls, for when its container also holds another group. Never sent.
export interface ExtractedField extends FieldDescriptor { groupIndex: number; container: HTMLElement; members?: HTMLElement[] }
export type FillResult = 'filled' | 'skipped_nonempty' | 'no_match' | 'error';

export const clean = (s: string | null | undefined) => (s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export function toDescriptor({ id, label, kind, options, section, required }: ExtractedField): FieldDescriptor {
  const d: FieldDescriptor = { id, label, kind, required };
  if (options) d.options = options;
  if (section) d.section = section;
  return d;
}
