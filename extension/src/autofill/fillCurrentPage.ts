import { browser } from 'wxt/browser';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { getProfile, getResume } from '../storage/store';
import { storedToFile } from '../storage/fileCodec';
import type { AtsAdapter } from '../ats/types';
import { runAutofill, formatReport } from './runAutofill';
import type { BgMessage, MapReply } from '../messages';
import { markResumeReload, resumeReloadPending, clearResumeReload } from './resumeReload';

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

export async function fillCurrentPage(adapter: AtsAdapter): Promise<string> {
  const resumeDone = !!adapter.resumeReloadsPage && resumeReloadPending();
  clearResumeReload(); // before any await, so a second banner on the reloaded page does not fill again
  const profile = await getProfile();
  if (!profile?.reviewed) throw new Error('Review your profile in setup first.');
  const stored = await getResume();
  const report = await runAutofill({
    profile,
    resume: stored ? storedToFile(stored) : null,
    extract: () => adapter.extract(document),
    map: mapViaBackground,
    fill: adapter.fill,
    // Marked before the upload: the page may start unloading as soon as the input changes.
    fillFile: adapter.resumeReloadsPage
      ? async (f, file) => { markResumeReload(); const r = await adapter.fillFile(f, file); if (r !== 'filled') clearResumeReload(); return r; }
      : adapter.fillFile,
    ensureGroups: (p) => adapter.ensureGroups(document, p),
    resumeFirst: adapter.resumeReloadsPage,
    resumeDone,
  });
  return formatReport(report);
}
