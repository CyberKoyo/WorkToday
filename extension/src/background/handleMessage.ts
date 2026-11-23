import { browser } from 'wxt/browser';
import { mapFields as realMapFields, MapError } from '../api/mapClient';
import { answerQuestions } from '../gemini/answerQuestions';
import { getApiKey, getProfile, getResumes } from '../storage/store';
import { syncSheet as realSync, trackApplication } from '../sheets/track';
import type { AnswerReply, BgMessage, LoopReply, MapReply, SyncReply } from '../messages';
import { loopJob, loopStart } from './loop';
import { greenhousePosting } from '../greenhouse/posting';
import { companyFromUrl } from '../tracker/company';

const JOB_TEXT_MAX = 8000; // what an essay draft gets to read about the job

async function answerFields(fields: Parameters<typeof answerQuestions>[0], job = ''): Promise<Map<string, string[]>> {
  const profile = await getProfile();
  if (!profile) return new Map();
  return answerQuestions(fields, profile, await getApiKey(), fetch, new Date(), job, await getResumes());
}

export async function handleMessage(
  msg: BgMessage,
  deps: { mapFields?: typeof realMapFields; answerFields?: typeof answerFields; openOptions?: () => Promise<void>;
    track?: typeof trackApplication; syncSheet?: typeof realSync; posting?: (frameUrl: string) => Promise<string> } = {},
  tab?: { id?: number; title?: string; url?: string }, // the sender's tab: the job page itself when the form sits in a frame
  frameUrl?: string, // the address of the frame that asked: the form's own page
): Promise<MapReply | AnswerReply | SyncReply | LoopReply | undefined> {
  if (msg.type === 'loop-start') return loopStart();
  if (msg.type === 'loop-job') return tab?.id === undefined ? { ok: false, message: 'Loop failed.' } : loopJob(msg, tab.id);
  if (msg.type === 'open-options') {
    await (deps.openOptions ?? (() => browser.runtime.openOptionsPage()))();
    return undefined;
  }
  if (msg.type === 'open-tracker') {
    const q = new URLSearchParams({ title: msg.title, company: companyFromUrl(tab?.url ?? '') });
    await browser.tabs.create({ url: browser.runtime.getURL(`/tracker.html?${q}`) });
    return undefined;
  }
  if (msg.type === 'track') {
    await (deps.track ?? trackApplication)(tab?.title || msg.name, tab?.url || msg.url, undefined, msg.from);
    return undefined;
  }
  if (msg.type === 'sync-sheet') {
    try {
      await (deps.syncSheet ?? realSync)();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not update the sheet.' };
    }
  }
  if (msg.type === 'answer-fields') {
    try {
      // `msg.job` is only what the form's own page shows. A form in a frame (an embedded Greenhouse application) has no
      // posting around it: the tab's title names the role, and the posting itself is fetched where the site offers it.
      let job = msg.job;
      if (job) {
        const posting = await (deps.posting ?? greenhousePosting)(frameUrl ?? '').catch(() => '');
        job = [tab?.title, posting || job].filter(Boolean).join('\n').slice(0, JOB_TEXT_MAX);
      }
      return { ok: true, answers: [...(await (deps.answerFields ?? answerFields)(msg.fields, job)).entries()] };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Gemini could not answer.' };
    }
  }
  try {
    const m = await (deps.mapFields ?? realMapFields)(msg.fields);
    return { ok: true, mappings: [...m.entries()] };
  } catch (e) {
    return { ok: false, code: e instanceof MapError ? e.code : 'server' };
  }
}
