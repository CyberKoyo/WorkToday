import { browser } from 'wxt/browser';

// Optional passphrase lock for the saved secrets (Gemini key, account password, job loop password). Locked, they sit in
// storage.local as AES-GCM ciphertext. The key, derived from the passphrase (PBKDF2), lives only in storage.session:
// the browser empties it on close, and content scripts cannot read it (checked live: Chrome refuses them, Firefox does
// not give them storage.session at all). So a job page's content script never holds the key; it asks the background
// for one password, which the background hands only to a supported site's own frame (handleMessage).

export interface Sealed { iv: string; ct: string }
interface Vault { salt: string; check: Sealed }
const VAULT = 'vault';
const KEY = 'vaultKey';
const CHECK = 'job-application-filler'; // sealed with the key, so a wrong passphrase is told apart from a right one
const ITERATIONS = 600_000; // OWASP's figure for PBKDF2-HMAC-SHA256

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const isSealed = (v: unknown): v is Sealed =>
  !!v && typeof v === 'object' && typeof (v as Sealed).iv === 'string' && typeof (v as Sealed).ct === 'string';

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encrypt(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))) };
}
const decrypt = async (key: CryptoKey, s: Sealed) =>
  new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(s.iv) }, key, bytes(s.ct)));

const vault = async () => (await browser.storage.local.get(VAULT))[VAULT] as Vault | undefined;
async function sessionKey(): Promise<CryptoKey | null> {
  try {
    const raw = (await browser.storage.session.get(KEY))[KEY] as string | undefined;
    return raw ? await crypto.subtle.importKey('raw', bytes(raw), 'AES-GCM', true, ['encrypt', 'decrypt']) : null;
  } catch { return null; } // a content script: no storage.session for it
}
const keep = async (key: CryptoKey) => browser.storage.session.set({ [KEY]: b64(await crypto.subtle.exportKey('raw', key)) });

export async function vaultState(): Promise<'off' | 'locked' | 'unlocked'> {
  return !(await vault()) ? 'off' : (await sessionKey()) ? 'unlocked' : 'locked';
}

/** A stored secret as text: '' while locked, and in any content script. */
export async function open(v: unknown): Promise<string> {
  if (typeof v === 'string') return v;
  if (!isSealed(v)) return '';
  const key = await sessionKey();
  return key ? decrypt(key, v).catch(() => '') : '';
}

/** A secret as it is to be stored: sealed when there is a passphrase. Refuses while locked, so a box that shows empty
 * because the secrets are locked never overwrites the real value. */
export async function seal(text: string): Promise<string | Sealed> {
  if (!(await vault())) return text;
  const key = await sessionKey();
  if (!key) throw new Error('Unlock your saved secrets first (Settings).');
  return encrypt(key, text);
}

/** False for a wrong passphrase. */
export async function unlock(passphrase: string): Promise<boolean> {
  const v = await vault();
  if (!v) return true;
  const key = await derive(passphrase, bytes(v.salt));
  if ((await decrypt(key, v.check).catch(() => '')) !== CHECK) return false;
  await keep(key);
  return true;
}
export const lock = () => browser.storage.session.remove(KEY);

/** A new passphrase (a new salt and key, unlocked), or '' for none. The caller re-seals the secrets (setPassphrase). */
export async function replaceVault(passphrase: string): Promise<void> {
  if (!passphrase) { await browser.storage.local.remove(VAULT); await lock(); return; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(passphrase, salt);
  await browser.storage.local.set({ [VAULT]: { salt: b64(salt), check: await encrypt(key, CHECK) } satisfies Vault });
  await keep(key);
}
