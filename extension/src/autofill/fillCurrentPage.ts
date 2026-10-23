import { browser } from 'wxt/browser';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { getProfile, getResume, getSavedAnswers, saveAnswer } from '../storage/store';
import { rememberAnswers } from '../answers/remembered';
import { storedToFile } from '../storage/fileCodec';
import type { AtsAdapter } from '../ats/types';
import { runAutofill, formatReport } from './runAutofill';
import type { AnswerReply, BgMessage, MapReply } from '../messages';
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

async function answerViaBackground(fields: FieldDescriptor[]): Promise<Map<string, string[]>> {
  const reply = (await browser.runtime.sendMessage({ type: 'answer-fields', fields } satisfies BgMessage)) as AnswerReply;
  if (!reply?.ok) throw new Error(reply?.message ?? 'Gemini could not answer.');
  return new Map(reply.answers);
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
    remembered: await getSavedAnswers(),
    answer: answerViaBackground,
  });
  // What the applicant now types into the fields left to them (or corrects after Gemini) is kept for the next form.
  rememberAnswers([...report.attention, ...(report.answered ?? [])], (k, v) => { saveAnswer(k, v).catch((e) => console.warn('[workday-filler] could not save answer', e)); });
  return formatReport(report);
}
