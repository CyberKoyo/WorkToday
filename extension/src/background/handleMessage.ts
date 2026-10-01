import { browser } from 'wxt/browser';
import { mapFields as realMapFields, MapError } from '../api/mapClient';
import type { BgMessage, MapReply } from '../messages';

export async function handleMessage(
  msg: BgMessage,
  deps: { mapFields?: typeof realMapFields; openOptions?: () => Promise<void> } = {},
): Promise<MapReply | undefined> {
  if (msg.type === 'open-options') {
    await (deps.openOptions ?? (() => browser.runtime.openOptionsPage()))();
    return undefined;
  }
  try {
    const m = await (deps.mapFields ?? realMapFields)(msg.fields);
    return { ok: true, mappings: [...m.entries()] };
  } catch (e) {
    return { ok: false, code: e instanceof MapError ? e.code : 'server' };
  }
}
