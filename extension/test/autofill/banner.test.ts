import { describe, it, expect, vi } from 'vitest';
import { setDetails, showBanner } from '../../src/autofill/banner';

const btn = (host: HTMLElement, sel: string) => host.shadowRoot!.querySelector<HTMLButtonElement>(sel)!;
const msg = (host: HTMLElement) => host.shadowRoot!.querySelector('.msg')!.textContent;

describe('banner', () => {
  it('Auto-fill runs onFill and shows its summary', async () => {
    const onFill = vi.fn().mockResolvedValue('Filled 3 fields.');
    const { host } = showBanner({ needsSetup: false, onFill, onSetup: vi.fn(), onDismiss: vi.fn() });
    expect(btn(host, '.primary').textContent).toBe('Auto-fill');
    btn(host, '.primary').click();
    await vi.waitFor(() => expect(msg(host)).toBe('Filled 3 fields.'));
  });
  it('after a fill, Copy details puts what the reader saw on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { host } = showBanner({ needsSetup: false, onFill: async () => { setDetails('wf-0 checkbox* key=null -> filled | I agree'); return 'Filled 1 fields.'; }, onSetup: vi.fn(), onDismiss: vi.fn() });
    expect(btn(host, '.copy').hidden).toBe(true);
    btn(host, '.primary').click();
    await vi.waitFor(() => expect(btn(host, '.copy').hidden).toBe(false));
    btn(host, '.copy').click();
    await vi.waitFor(() => expect(btn(host, '.copy').textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith('wf-0 checkbox* key=null -> filled | I agree');
    vi.unstubAllGlobals();
  });
  it('shows error message on failure and re-enables', async () => {
    const { host } = showBanner({ needsSetup: false, onFill: vi.fn().mockRejectedValue(new Error('Busy')), onSetup: vi.fn(), onDismiss: vi.fn() });
    btn(host, '.primary').click();
    await vi.waitFor(() => expect(msg(host)).toBe('Busy'));
    expect(btn(host, '.primary').disabled).toBe(false);
  });
  it('autoFill runs the fill without a click', async () => {
    const onFill = vi.fn().mockResolvedValue('Filled 3 fields.');
    const { host } = showBanner({ needsSetup: false, onFill, onSetup: vi.fn(), onDismiss: vi.fn(), autoFill: true });
    await vi.waitFor(() => expect(msg(host)).toBe('Filled 3 fields.'));
    expect(onFill).toHaveBeenCalledTimes(1);
  });
  it('offers the dashboard beside Auto-fill', () => {
    const onSetup = vi.fn();
    const { host } = showBanner({ needsSetup: false, onFill: vi.fn(), onSetup, onDismiss: vi.fn() });
    btn(host, '.link').click();
    expect(onSetup).toHaveBeenCalledTimes(1);
    expect(btn(showBanner({ needsSetup: true, onFill: vi.fn(), onSetup, onDismiss: vi.fn() }).host, '.link').hidden).toBe(true);
  });
  it('setup mode', () => {
    const onSetup = vi.fn();
    const { host } = showBanner({ needsSetup: true, onFill: vi.fn(), onSetup, onDismiss: vi.fn() });
    btn(host, '.primary').click();
    expect(onSetup).toHaveBeenCalled();
  });
  it('dismiss removes', () => {
    const onDismiss = vi.fn();
    const { host } = showBanner({ needsSetup: false, onFill: vi.fn(), onSetup: vi.fn(), onDismiss });
    btn(host, '.close').click();
    expect(host.isConnected).toBe(false);
    expect(onDismiss).toHaveBeenCalled();
  });
  it('framed banner is prepended and static', () => {
    document.body.innerHTML = '<form id="f"></form>';
    const { host } = showBanner({ needsSetup: false, onFill: vi.fn(), onSetup: vi.fn(), onDismiss: vi.fn(), framed: true });
    expect(document.body.firstElementChild).toBe(host);
    expect(host.shadowRoot!.querySelector('.box')!.classList.contains('framed')).toBe(true);
    expect(host.shadowRoot!.querySelector('strong')!.textContent).toBe('Job Application Filler');
  });
  it('shows past applications this job may be, and nothing when there are none', () => {
    const seen = (notice?: string) => {
      const { host } = showBanner({ needsSetup: false, onFill: vi.fn(), onSetup: vi.fn(), onDismiss: vi.fn(), notice });
      return host.shadowRoot!.querySelector<HTMLElement>('.seen')!;
    };
    expect(seen('You may have applied here before:\n• Analyst at Acme (2026-01-02, Rejected)').hidden).toBe(false);
    expect(seen().hidden).toBe(true);
  });
});

