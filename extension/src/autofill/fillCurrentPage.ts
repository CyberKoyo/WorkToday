import { browser } from 'wxt/browser';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { addAccountRefused, getAccountPassword, getAccountRefused, getCertProofs, getProfile, getResume, getSavedAnswers, saveAnswer } from '../storage/store';
import { rememberAnswers } from '../answers/remembered';
import { storedToFile } from '../storage/fileCodec';
import type { AtsAdapter } from '../ats/types';
import { runAutofill, formatReport, type AutofillReport } from './runAutofill';
import type { AnswerReply, BgMessage, MapReply } from '../messages';
import { markResumeReload, resumeReloadPending, clearResumeReload } from './resumeReload';
import { clearAdvance, complete, markAdvance, markAccountTried, nextButton } from './advance';
import { waitFor } from '../fill/dom';
import { setDetails } from './banner';
import { companyFromPage } from '../tracker/company';
import { jobLocation } from '../tracker/location';

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

let accountRunning = false;

/** `onReport`: the run's result as data, for the job loop to decide whether the step can be sent. */
export async function fillCurrentPage(adapter: AtsAdapter, onReport?: (r: AutofillReport) => void): Promise<string> {
  const resumeDone = !!adapter.resumeReloadsPage && resumeReloadPending();
  clearResumeReload(); // before any await, so a second banner on the reloaded page does not fill again
  clearAdvance();
  const profile = await getProfile();
  if (!profile?.reviewed) throw new Error('Review your profile in setup first.');
  if (adapter.accountPage?.(document) && adapter.account) {
    const password = await getAccountPassword();
    if (!password || !profile.email) return 'Sign in or create your account, or save an account password in setup to have it done for you.';
    if ((await getAccountRefused()).includes(location.host)) return 'Your saved account password was refused on this site before, so it is not tried again. Sign in yourself.';
    // The step re-renders (Create Account → Sign In) while this runs; the banner that brings must not start a second try.
    if (accountRunning) return 'Signing in…';
    accountRunning = true;
    let problem: string | null;
    let attempted = false;
    try { problem = await adapter.account(document, profile.email, password, () => { attempted = true; markAccountTried(); }); } finally { accountRunning = false; }
    // Only a sent sign-in that came back refused counts; "press Create Account yourself" is not a refusal.
    if (problem && attempted) await addAccountRefused(location.host);
    if (problem) return problem;
    await markAdvance(); // the application's first step fills itself
    return 'Signed in.';
  }
  const stored = await getResume();
  const proofs = await getCertProofs();
  let read = 0; // fields the last pass saw
  const deps: Parameters<typeof runAutofill>[0] = {
    profile,
    resume: stored ? storedToFile(stored) : null,
    extract: () => { const f = adapter.extract(document); read = f.length; return f; },
    map: mapViaBackground,
    fill: adapter.fill,
    // Marked before the upload: the page may start unloading as soon as the input changes.
    fillFile: adapter.resumeReloadsPage
      ? async (f, file) => { await markResumeReload(); const r = await adapter.fillFile(f, file); if (r !== 'filled') clearResumeReload(); return r; }
      : adapter.fillFile,
    proof: async (f) => {
      const file = proofs[profile.certifications[f.groupIndex]?.name ?? ''];
      return file ? adapter.fillFile(f, storedToFile(file)) : null;
    },
    ensureGroups: async (p) => { await adapter.prepare?.(document); await adapter.ensureGroups(document, p); },
    resumeFirst: adapter.resumeReloadsPage,
    resumeDone,
    remembered: await getSavedAnswers(),
    answer: answerViaBackground,
    options: adapter.options,
  };
  // A step Auto-fill just moved to can still be rendering (live Bloomberg: the questions step read as empty and
  // reported "Filled 0"); wait until the number of fields holds still.
  let seen = -1;
  let held = 0;
  await waitFor(() => {
    const n = adapter.extract(document).length;
    held = n === seen ? held + 1 : 0;
    seen = n;
    return n > 0 && held >= 8 ? true : null; // 8 polls of 50ms
  }, 4000);
  let report = await runAutofill(deps);
  // An answer can reveal a follow-up ("What is your Current Degree Program?" after "Yes", live RTX): fill again for it.
  // Workday shows the follow-up a moment after the answer lands.
  const grew = () => waitFor(() => (adapter.extract(document).length > read ? true : null), 1500);
  for (let pass = 0; pass < 2 && !report.reloading && (await grew()); pass++) {
    const more = await runAutofill({ ...deps, resumeDone: true });
    report = { ...more, filled: report.filled + more.filled, recalled: (report.recalled ?? 0) + (more.recalled ?? 0),
      answered: [...(report.answered ?? []), ...(more.answered ?? [])], missed: [...report.missed, ...more.missed] };
  }
  // What the applicant now types into the fields left to them (or corrects after Gemini) is kept for the next form.
  rememberAnswers([...report.attention, ...(report.answered ?? [])], (k, v) => { saveAnswer(k, v).catch((e) => console.warn('[workday-filler] could not save answer', e)); });
  if (report.filled) {
    // The referrer ties this page to the careers page whose Apply opened it (one application, two sites).
    // The company only from the tab's own page: a framed form's address is the board's, not the tab's that is logged.
    // The location from this frame's own address: an embedded form's posting is the board's.
    const top = window.top === window;
    // Read now: by the time the location comes back, Auto-fill may have moved on to the next step.
    const text = document.body.innerText;
    const track = { type: 'track', name: document.title, url: location.href, from: top ? document.referrer : undefined,
      company: top ? companyFromPage(location.href, text) || undefined : undefined } satisfies BgMessage;
    jobLocation(document, track.url).then((where) => browser.runtime.sendMessage({ ...track,
      ...(where ? { location: where } : { text }) } satisfies BgMessage))
      .catch((e) => console.warn('[workday-filler] application not logged', e));
  }
  setDetails(details(adapter.id, !!stored, report));
  // Nothing left for the applicant: press Next, and the step it lands on fills itself (mount.ts).
  const next = complete(report) ? (adapter.nextButton ?? nextButton)(document) : null;
  if (next) {
    await new Promise((r) => setTimeout(r, 500)); // let the site's own checks of the last field settle
    // Pressed once only: Workday turns this same button into Submit on the last step, so a retry could submit.
    await markAdvance(); // stored before the page can unload
    next.click();
    report.advanced = true;
  }
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
