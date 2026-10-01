import { describe, it, expect, vi } from 'vitest';
import { runAutofill, formatReport } from '../../src/autofill/runAutofill';
import { extractFields } from '../../src/workday/extractFields';
import { emptyProfile } from '../../src/profile/profile';

const html = `
  <div data-automation-id="formField-a"><label>First Name*</label><input type="text"></div>
  <div data-automation-id="formField-b"><label>Last Name*</label><input type="text" value="Typed"></div>
  <div data-automation-id="formField-c"><label>Favourite colour*</label><input type="text"></div>
  <div data-automation-id="formField-d"><label>Resume</label><input type="file"></div>`;

function deps(over: Record<string, unknown> = {}) {
  document.body.innerHTML = html;
  return {
    profile: { ...emptyProfile(), firstName: 'Ada', lastName: 'L', reviewed: true },
    resume: new File(['x'], 'r.pdf'),
    extract: () => extractFields(document),
    map: vi.fn().mockResolvedValue(new Map([['wf-0', 'firstName'], ['wf-1', 'lastName'], ['wf-2', null], ['wf-3', 'resumeFile']])),
    fill: vi.fn(async (f: { container: HTMLElement }) => (f.container.querySelector('input')!.value ? 'skipped_nonempty' : 'filled')),
    fillFile: vi.fn().mockResolvedValue('filled'),
    ensureGroups: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runAutofill', () => {
  it('fills mapped, skips non-empty, flags unmatched required, uploads resume', async () => {
    const d = deps();
    const r = await runAutofill(d as never);
    expect(d.ensureGroups).toHaveBeenCalled();
    expect(d.fill).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-0' }), 'Ada');
    expect(d.fillFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-3' }), d.resume);
    expect(r.filled).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.attention.map((f) => f.label)).toEqual(['Favourite colour']);
    expect(r.attention[0]!.container.dataset.wfUnfilled).toBe('1');
  });
  it('no resume stored -> resume field needs attention', async () => {
    const r = await runAutofill(deps({ resume: null }) as never);
    expect(r.attention.map((f) => f.label)).toContain('Resume');
  });
  it('skips fields removed from DOM mid-fill', async () => {
    const d = deps({ fill: vi.fn(async (f: { id: string }) => { if (f.id === 'wf-0') document.querySelector('[data-wf-id="wf-2"]')!.remove(); return 'filled'; }) });
    const r = await runAutofill(d as never);
    expect(r.attention).toHaveLength(0);
  });
  it('formatReport', () => {
    expect(formatReport({ filled: 3, skipped: 1, attention: [{} as never] }))
      .toBe('Filled 3 fields. 1 already had values. 1 need your attention (highlighted). Review, then continue.');
  });
});
