import { browser } from 'wxt/browser';
import { mapFields as realMapFields, MapError } from '../api/mapClient';
import { answerQuestions } from '../gemini/answerQuestions';
import { getApiKey, getProfile } from '../storage/store';
import type { AnswerReply, BgMessage, MapReply } from '../messages';

async function answerFields(fields: Parameters<typeof answerQuestions>[0]): Promise<Map<string, string[]>> {
  const profile = await getProfile();
  if (!profile) return new Map();
  return answerQuestions(fields, profile, await getApiKey());
}

export async function handleMessage(
  msg: BgMessage,
  deps: { mapFields?: typeof realMapFields; answerFields?: typeof answerFields; openOptions?: () => Promise<void> } = {},
): Promise<MapReply | AnswerReply | undefined> {
  if (msg.type === 'open-options') {
    await (deps.openOptions ?? (() => browser.runtime.openOptionsPage()))();
    return undefined;
  }
  if (msg.type === 'open-tracker') {
    await browser.tabs.create({ url: browser.runtime.getURL(`/tracker.html?title=${encodeURIComponent(msg.title)}`) });
    return undefined;
  }
  if (msg.type === 'answer-fields') {
    try {
      return { ok: true, answers: [...(await (deps.answerFields ?? answerFields)(msg.fields)).entries()] };
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
