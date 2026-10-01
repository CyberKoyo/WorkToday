import { browser } from 'wxt/browser';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { getProfile, getResume } from '../storage/store';
import { storedToFile } from '../storage/fileCodec';
import { extractFields } from '../workday/extractFields';
import { ensureRepeatGroups } from '../workday/ensureRepeatGroups';
import { fillField, fillFile } from '../fill/fillField';
import { runAutofill, formatReport } from './runAutofill';
import type { BgMessage, MapReply } from '../messages';

const ERRORS: Record<string, string> = {
  rate_limited: 'Mapping service is busy. Try again in a minute.',
  network: 'Could not reach the mapping service. Check your connection.',
  server: 'Mapping service error. Try again shortly.',
  bad_response: 'Mapping service returned an unreadable reply.',
};

async function mapViaBackground(fields: FieldDescriptor[]): Promise<Map<string, ProfileKey | null>> {
  const reply = (await browser.runtime.sendMessage({ type: 'map-fields', fields } satisfies BgMessage)) as MapReply;
  if (!reply?.ok) throw new Error(ERRORS[reply?.code ?? 'server']);
  return new Map(reply.mappings);
}

export async function fillCurrentPage(): Promise<string> {
  const profile = await getProfile();
  if (!profile?.reviewed) throw new Error('Review your profile in setup first.');
  const stored = await getResume();
  const report = await runAutofill({
    profile,
    resume: stored ? storedToFile(stored) : null,
    extract: () => extractFields(document),
    map: mapViaBackground,
    fill: fillField,
    fillFile: (f, file) => fillFile(f, file),
    ensureGroups: (p) => ensureRepeatGroups(document, p),
  });
  return formatReport(report);
}
