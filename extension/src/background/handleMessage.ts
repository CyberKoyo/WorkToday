import { browser } from 'wxt/browser';
import { mapFields as realMapFields, MapError } from '../api/mapClient';
import { answerQuestions } from '../gemini/answerQuestions';
import { getAccountPassword, getApiKey, getLoopSettings, getProfile, getResumes } from '../storage/store';
import { vaultState } from '../storage/vault';
import { atsAt } from '../ats/matches';
import { syncSheet as realSync, trackApplication } from '../sheets/track';
import type { AnswerReply, BgMessage, LoopReply, MapReply, SecretReply, SyncReply } from '../messages';

// The ATS whose own account step the account password is for (the adapters with `account`).
const ACCOUNT_SITES = ['workday'];
import { loopJob, loopStart } from './loop';
import { greenhousePosting } from '../greenhouse/posting';
import { companyFromUrl } from '../tracker/company';
import { guessLocation } from '../gemini/guessLocation';

const JOB_TEXT_MAX = 8000; // what an essay draft gets to read about the job

async function answerFields(fields: Parameters<typeof answerQuestions>[0], job = ''): Promise<Map<string, string[]>> {
  const profile = await getProfile();
  if (!profile) return new Map();
  return answerQuestions(fields, profile, await getApiKey(), fetch, new Date(), job, await getResumes());
}

export async function handleMessage(
  msg: BgMessage,
  deps: { mapFields?: typeof realMapFields; answerFields?: typeof answerFields; openOptions?: () => Promise<void>;
    track?: typeof trackApplication; syncSheet?: typeof realSync; guess?: typeof guessLocation; posting?: (frameUrl: string) => Promise<string> } = {},
  tab?: { id?: number; title?: string; url?: string }, // the sender's tab: the job page itself when the form sits in a frame
  frameUrl?: string, // the address of the frame that asked: the form's own page
): Promise<MapReply | AnswerReply | SyncReply | LoopReply | SecretReply | undefined> {
  if (msg.type === 'secret') {
    // Only to a supported site's own frame, by the address the browser reports for it: never a page the generic reader
    // fills, and never a frame inside one. The account password only to the site whose account step it is for.
    const ats = atsAt(frameUrl ?? '');
    if (!ats || (msg.which === 'account' && !ACCOUNT_SITES.includes(ats))) return { value: '' };
    return { value: msg.which === 'account' ? await getAccountPassword() : (await getLoopSettings()).password };
  }
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
    // No posting data on the page: Gemini reads its text, once, for a job not logged yet, when there is a key.
    const text = msg.location ? '' : msg.text?.slice(0, JOB_TEXT_MAX);
    const guess = text ? async () => {
      const key = await getApiKey();
      const loc = key ? await (deps.guess ?? guessLocation)(text, key) : '';
      return loc && `${loc} (guessed)`;
    } : undefined;
    // The site's own job title beats the tab's, which can carry the board's name too (UKG).
    await (deps.track ?? trackApplication)(msg.title || tab?.title || msg.name, tab?.url || msg.url, undefined, msg.from, msg.company,
      { location: msg.location, guess });
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
    if ((await vaultState()) === 'locked') return { ok: false, message: 'Your Gemini key is locked: unlock it in the dashboard (Settings).' };
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
