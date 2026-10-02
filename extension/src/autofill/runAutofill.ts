import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { toDescriptor, type ExtractedField } from '../workday/extractFields';
import { resolveProfileValue, type Profile } from '../profile/profile';
import type { fillField, FillResult } from '../fill/fillField';

export interface AutofillReport { filled: number; skipped: number; attention: ExtractedField[]; missed: string[] }
export interface AutofillDeps {
  profile: Profile;
  resume: File | null;
  extract: () => ExtractedField[];
  map: (fields: FieldDescriptor[]) => Promise<Map<string, ProfileKey | null>>;
  fill: typeof fillField;
  fillFile: (f: ExtractedField, file: File) => Promise<FillResult>;
  ensureGroups: (p: Profile) => Promise<void>;
}

function flag(f: ExtractedField) {
  f.container.dataset.wfUnfilled = '1';
  f.container.style.outline = '2px solid #f59e0b';
  f.container.style.outlineOffset = '4px';
}

export async function runAutofill(d: AutofillDeps): Promise<AutofillReport> {
  await d.ensureGroups(d.profile);
  const fields = d.extract();
  const report: AutofillReport = { filled: 0, skipped: 0, attention: [], missed: [] };
  if (!fields.length) return report;
  const mapping = await d.map(fields.map(toDescriptor));

  for (const f of fields) {
    if (!f.container.isConnected) continue; // e.g. "To" date removed after ticking "I currently work here"
    const key = mapping.get(f.id) ?? null;
    let result: FillResult = 'no_match';
    const missed: string[] = [];
    if (key === 'resumeFile') {
      if (d.resume) result = await d.fillFile(f, d.resume);
    } else if (key) {
      const value = resolveProfileValue(d.profile, key, f.groupIndex);
      if (value !== null) result = await d.fill(f, value, undefined, missed);
    }
    report.missed.push(...missed);
    if (result === 'filled' && missed.length) { report.filled++; report.attention.push(f); flag(f); } // partly filled
    else if (result === 'filled') report.filled++;
    else if (result === 'skipped_nonempty') report.skipped++;
    else if (f.required || key) { report.attention.push(f); flag(f); }
  }
  return report;
}

export function formatReport(r: AutofillReport): string {
  const missed = r.missed.length ? ` Not added, fill in by hand: ${r.missed.join(', ')}.` : '';
  return `Filled ${r.filled} fields. ${r.skipped} already had values. ${r.attention.length} need your attention (highlighted).${missed} Review, then continue.`;
}
