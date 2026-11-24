import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { forgetSecrets, getAccountPassword, getApiKey, getLoopSettings, saveAccountPassword, saveApiKey, saveLoopSettings, setPassphrase } from '../../src/storage/store';
import { lock, unlock, vaultState } from '../../src/storage/vault';

const stored = async () => JSON.stringify(await browser.storage.local.get(null));
const PASS = 'correct horse battery';

beforeEach(async () => {
  fakeBrowser.reset();
  await saveApiKey('k-123');
  await saveAccountPassword('pw-acct');
  await saveLoopSettings({ email: 'ada@x.com', password: 'pw-loop', submit: true });
});

describe('vault', () => {
  it('without a passphrase, stores the secrets as typed', async () => {
    expect(await vaultState()).toBe('off');
    expect(await stored()).toContain('pw-acct');
  });

  it('with one, stores only ciphertext and reads back while unlocked', async () => {
    await setPassphrase(PASS);
    expect(await vaultState()).toBe('unlocked');
    for (const secret of ['k-123', 'pw-acct', 'pw-loop']) expect(await stored()).not.toContain(secret);
    expect(await getApiKey()).toBe('k-123');
    expect(await getAccountPassword()).toBe('pw-acct');
    expect(await getLoopSettings()).toEqual({ email: 'ada@x.com', password: 'pw-loop', submit: true });
  });

  it('locked: reads empty, refuses to overwrite, and opens only with the right passphrase', async () => {
    await setPassphrase(PASS);
    await lock();
    expect(await vaultState()).toBe('locked');
    expect([await getApiKey(), await getAccountPassword(), (await getLoopSettings()).password]).toEqual(['', '', '']);
    await expect(saveApiKey('')).rejects.toThrow(/Unlock/); // the box shows empty while locked: saving it must not wipe the key
    await expect(setPassphrase('other passphrase')).rejects.toThrow(/Unlock/);
    expect(await unlock('wrong passphrase')).toBe(false);
    expect(await unlock(PASS)).toBe(true);
    expect(await getApiKey()).toBe('k-123');
  });

  it('a content script, which has no storage.session, never opens them', async () => {
    await setPassphrase(PASS);
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('Access to storage is not allowed from this context.'));
    expect(await getAccountPassword()).toBe('');
    vi.restoreAllMocks();
  });

  it('changes and removes the passphrase without losing the secrets', async () => {
    await setPassphrase(PASS);
    await setPassphrase('a newer passphrase');
    await lock();
    expect(await unlock(PASS)).toBe(false);
    expect(await unlock('a newer passphrase')).toBe(true);
    await setPassphrase('');
    expect(await vaultState()).toBe('off');
    expect(await stored()).toContain('pw-loop');
  });

  it('forgotten passphrase: clears the lock and the secrets, keeps the rest', async () => {
    await setPassphrase(PASS);
    await lock();
    await forgetSecrets();
    expect(await vaultState()).toBe('off');
    expect(await getLoopSettings()).toEqual({ email: 'ada@x.com', password: '', submit: true });
    expect(await getApiKey()).toBe('');
  });
}, 60_000);
