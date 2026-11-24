import { browser } from 'wxt/browser';
import type { BgMessage, SecretReply } from '../messages';

/** A saved password, from the background: a content script never reads one from storage itself (vault.ts). '' when
 * there is none, it is locked, or this frame is not a supported site's own. */
export async function askSecret(which: 'account' | 'loop'): Promise<string> {
  try {
    return ((await browser.runtime.sendMessage({ type: 'secret', which } satisfies BgMessage)) as SecretReply | undefined)?.value ?? '';
  } catch { return ''; } // the extension was reloaded under this page
}
