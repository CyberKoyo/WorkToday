import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import type { ProfileValue } from '../profile/profile';

// members: a radio/checkbox group's own controls, for when its container also holds another group.
// profileKey: known from the page itself, so the field is not sent to the mapper.
// tieBreak: text that picks among equally good options (the city among one zip's results).
// answer: the value the adapter settles itself, ahead of any profile key (ADP's "Reviewed" consent).
// asked: false while the site keeps the question hidden (ADP shows its screening questions one answer at a time). None of these is ever sent.
export interface ExtractedField extends FieldDescriptor {
  groupIndex: number; container: HTMLElement; members?: HTMLElement[]; profileKey?: ProfileKey; tieBreak?: string; answer?: ProfileValue;
  asked?: () => boolean;
}
export type FillResult = 'filled' | 'skipped_nonempty' | 'no_match' | 'error';

export const clean = (s: string | null | undefined) => (s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export function toDescriptor({ id, label, kind, options, section, required }: ExtractedField): FieldDescriptor {
  const d: FieldDescriptor = { id, label, kind, required };
  if (options) d.options = options;
  if (section) d.section = section;
  return d;
}
