import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type OnCommand = (cmd: string, tab?: { id?: number }) => void;

async function start() {
  fakeBrowser.reset();
  fakeBrowser.permissions.contains = async () => false;
  fakeBrowser.permissions.onAdded.addListener = () => {}; // not implemented in the fake
  let onCommand: OnCommand = () => {};
  (fakeBrowser as unknown as { commands: unknown }).commands = { onCommand: { addListener: (f: OnCommand) => { onCommand = f; } } };
  const open = vi.fn(async () => {});
  fakeBrowser.runtime.openOptionsPage = open;
  const exec = vi.fn(async () => []);
  fakeBrowser.scripting.executeScript = exec as never;
  (await import('../../entrypoints/background')).default.main();
  return { open, exec, onCommand: (cmd: string, tab?: { id?: number }) => onCommand(cmd, tab) };
}

describe('background', () => {
  it('opens the setup page on a fresh install, not on an update', async () => {
    const { open } = await start();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.9.0' });
    expect(open).not.toHaveBeenCalled();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    expect(open).toHaveBeenCalledOnce();
  });

  it('the Auto-fill shortcut sets the run flag, then injects the toolbar script into the tab', async () => {
    const { exec, onCommand } = await start();
    onCommand('other', { id: 7 });
    onCommand('autofill', {});
    expect(exec).not.toHaveBeenCalled();
    onCommand('autofill', { id: 7 });
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
    const calls = exec.mock.calls as unknown as Array<[{ target: unknown; func?: () => void; files?: string[] }]>;
    expect(calls[0]![0].target).toEqual({ tabId: 7, allFrames: true });
    calls[0]![0].func!();
    expect((globalThis as { __wfAutoFill?: boolean }).__wfAutoFill).toBe(true);
    delete (globalThis as { __wfAutoFill?: boolean }).__wfAutoFill;
    expect(calls[1]![0].files).toEqual(['/manual.js']);
  });
});
