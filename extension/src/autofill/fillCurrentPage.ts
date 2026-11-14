import { browser } from 'wxt/browser';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { getProfile, getResume, getSavedAnswers, saveAnswer } from '../storage/store';
import { rememberAnswers } from '../answers/remembered';
import { storedToFile } from '../storage/fileCodec';
import type { AtsAdapter } from '../ats/types';
import { runAutofill, formatReport, type AutofillReport } from './runAutofill';
import type { AnswerReply, BgMessage, MapReply } from '../messages';
import { markResumeReload, resumeReloadPending, clearResumeReload } from './resumeReload';
import { setDetails } from './banner';

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

// What a prose answer can draw on: the job page's own words (title, and the posting when it shares the page).
const JOB_TEXT_MAX = 6000;

async function answerViaBackground(fields: FieldDescriptor[]): Promise<Map<string, string[]>> {
  const job = fields.some((f) => f.kind === 'textarea') ? `${document.title}\n${document.body.innerText}`.slice(0, JOB_TEXT_MAX) : '';
  const reply = (await browser.runtime.sendMessage({ type: 'answer-fields', fields, job } satisfies BgMessage)) as AnswerReply;
  if (!reply?.ok) throw new Error(reply?.message ?? 'Gemini could not answer.');
  return new Map(reply.answers);
}

/** `onReport`: the run's result as data, for the job loop to decide whether the step can be sent. */
export async function fillCurrentPage(adapter: AtsAdapter, onReport?: (r: AutofillReport) => void): Promise<string> {
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
    options: adapter.options,
  });
  // What the applicant now types into the fields left to them (or corrects after Gemini) is kept for the next form.
  rememberAnswers([...report.attention, ...(report.answered ?? [])], (k, v) => { saveAnswer(k, v).catch((e) => console.warn('[workday-filler] could not save answer', e)); });
  if (report.filled) {
    browser.runtime.sendMessage({ type: 'track', name: document.title, url: location.href } satisfies BgMessage)
      .catch((e) => console.warn('[workday-filler] application not logged', e));
  }
  setDetails(details(adapter.id, !!stored, report));
  onReport?.(report);
  return formatReport(report);
}

// For a bug report ("Copy details" on the banner): what the reader saw and did on this page. Labels and markup shape
// only; value attributes are dropped so nothing the applicant typed goes along.
function details(reader: string, resume: boolean, r: AutofillReport): string {
  const shape = (el: Element) => el.outerHTML.replace(/\s(class|style|value|d)="[^"]*"/g, '').replace(/\s+/g, ' ').slice(0, 600);
  const boxes = [...document.querySelectorAll<HTMLElement>('input[type="file"],input[type="checkbox"]')];
  const seen = [...new Set(boxes.map((el) => el.closest<HTMLElement>('[data-wf-id]')).filter((c) => !!c))];
  const unseen = boxes.filter((el) => !el.closest('[data-wf-id]'));
  return [
    `${location.host}${location.pathname} | reader=${reader} | resume stored=${resume}`,
    ...(r.log ?? []),
    ...seen.slice(0, 8).map((c) => `MARKUP ${c!.dataset.wfId} ${shape(c!)}`),
    ...unseen.slice(0, 8).map((el) => `UNSEEN ${shape(el.parentElement?.parentElement ?? el)}`),
  ].join('\n');
}
