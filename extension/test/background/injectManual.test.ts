import { describe, it, expect, vi } from 'vitest';
import { injectManual } from '../../src/background/injectManual';

describe('injectManual', () => {
  it('injects into every frame', async () => {
    const exec = vi.fn().mockResolvedValue([]);
    await injectManual(7, exec);
    expect(exec.mock.calls).toEqual([[{ tabId: 7, allFrames: true }]]);
  });
  it('retries the page alone when a frame refuses', async () => {
    const exec = vi.fn().mockRejectedValueOnce(new Error('Cannot access contents of url')).mockResolvedValue([]);
    await injectManual(7, exec);
    expect(exec.mock.calls).toEqual([[{ tabId: 7, allFrames: true }], [{ tabId: 7 }]]);
  });
  it('gives up quietly where the browser forbids scripts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(injectManual(7, vi.fn().mockRejectedValue(new Error('chrome:// URL')))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
