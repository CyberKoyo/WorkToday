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
    expect(d.fill).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-0' }), 'Ada', undefined, []);
    expect(d.fillFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-3' }), d.resume);
    expect(r.filled).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.attention.map((f) => f.label)).toEqual(['Favourite colour']);
    expect(r.attention[0]!.container.dataset.wfUnfilled).toBe('1');
  });
  it('a rerun clears highlights from earlier runs on fields that are now fine', async () => {
    const d = deps();
    const stale = document.querySelector<HTMLElement>('[data-automation-id="formField-a"]')!;
    stale.dataset.wfUnfilled = '1';
    stale.style.outline = '2px solid #f59e0b';
    await runAutofill(d as never);
    expect(stale.dataset.wfUnfilled).toBeUndefined();
    expect(stale.style.outline).toBe('');
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
  it('values a field could not take are reported and the field is highlighted', async () => {
    const d = deps({
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'skills']])),
      profile: { ...emptyProfile(), skills: ['Rust', 'TCP/IP'], reviewed: true },
      fill: vi.fn(async (_f: unknown, _v: unknown, _t: unknown, missed: string[]) => { missed.push('TCP/IP'); return 'filled'; }),
    });
    const r = await runAutofill(d as never);
    expect(r.filled).toBe(1);
    expect(r.missed).toEqual(['TCP/IP']);
    expect(r.attention.map((f) => f.label)).toContain('First Name');
    expect(r.attention.find((f) => f.label === 'First Name')!.container.dataset.wfUnfilled).toBe('1');
  });
  it('formatReport', () => {
    expect(formatReport({ filled: 3, skipped: 1, attention: [{} as never], missed: [] }))
      .toBe('Filled 3 fields. 1 already had values. 1 need your attention (highlighted). Review, then continue.');
    expect(formatReport({ filled: 3, skipped: 0, attention: [{} as never], missed: ['TCP/IP', 'Cobol'] }))
      .toBe('Filled 3 fields. 0 already had values. 1 need your attention (highlighted). Not added, fill in by hand: TCP/IP, Cobol. Review, then continue.');
  });
  it('preset keys skip the mapper; a Hispanic yes/no question is answered from ethnicity', async () => {
    const run = async (ethnicity: string) => {
      const base = deps(); // sets its own page; replaced below
      document.body.innerHTML = `
        <div data-automation-id="formField-gender"><label>How you self-identify*</label><button aria-haspopup="listbox">Select One</button></div>
        <div data-automation-id="formField-hispanicOrLatino"><label>Please indicate if you are Hispanic or Latino</label><button aria-haspopup="listbox">Select One</button></div>
        <div data-automation-id="formField-ethnicity"><label>Please select the ethnicity*</label><button aria-haspopup="listbox">Select One</button></div>
        <div data-automation-id="formField-q"><label>First Name</label><input type="text"></div>`;
      const fill = vi.fn().mockResolvedValue('filled');
      const map = vi.fn().mockResolvedValue(new Map([['wf-3', 'firstName']]));
      await runAutofill({ ...base, extract: () => extractFields(document), fill, map,
        profile: { ...emptyProfile(), firstName: 'Ada', gender: 'male', ethnicity, reviewed: true } } as never);
      return { map, values: fill.mock.calls.map((c) => [c[0].label, c[1]]) };
    };
    const a = await run('two or more races');
    expect(a.map).toHaveBeenCalledWith([expect.objectContaining({ id: 'wf-3' })]);
    expect(a.values).toEqual([
      ['How you self-identify', 'male'],
      ['Please indicate if you are Hispanic or Latino', 'No'],
      ['Please select the ethnicity', 'two or more races'],
      ['First Name', 'Ada'],
    ]);
    expect((await run('hispanic or latino')).values[1]).toEqual(['Please indicate if you are Hispanic or Latino', 'Yes']);
    expect((await run('decline')).values[1]).toEqual(['Please indicate if you are Hispanic or Latino', 'decline']);
  });
  it('a race/ethnicity field that lists Hispanic as an option still gets the ethnicity itself', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-x"><label>Race/Ethnicity (Hispanic or Latino, White, ...)</label><button aria-haspopup="listbox">Select One</button></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill, map: vi.fn().mockResolvedValue(new Map([['wf-0', 'ethnicity']])),
      profile: { ...emptyProfile(), ethnicity: 'white', reviewed: true } } as never);
    expect(fill.mock.calls[0]![1]).toBe('white');
  });
});
