import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('background', () => {
  it('opens the setup page on a fresh install, not on an update', async () => {
    fakeBrowser.reset();
    fakeBrowser.permissions.contains = async () => false;
    fakeBrowser.permissions.onAdded.addListener = () => {}; // not implemented in the fake
    const open = vi.fn(async () => {});
    fakeBrowser.runtime.openOptionsPage = open;
    (await import('../../entrypoints/background')).default.main();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.9.0' });
    expect(open).not.toHaveBeenCalled();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    expect(open).toHaveBeenCalledOnce();
  });
});
