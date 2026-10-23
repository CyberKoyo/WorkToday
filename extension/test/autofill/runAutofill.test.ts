import { describe, it, expect, vi } from 'vitest';
import { runAutofill, formatReport } from '../../src/autofill/runAutofill';
import { extractFields } from '../../src/workday/extractFields';
import { extractGeneric } from '../../src/generic/extract';
import { emptyProfile, emptyEdu } from '../../src/profile/profile';
import { greenhouse } from '../../src/greenhouse/adapter';
import { readFileSync } from 'node:fs';

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
  it('a phone number\'s country list gets the country, whatever the mapper said (live Greenhouse: left empty)', async () => {
    const base = deps();
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/greenhouse-application.html`, 'utf8');
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => greenhouse.extract(document), fill,
      map: vi.fn().mockResolvedValue(new Map()),
      profile: { ...emptyProfile(), country: 'United States of America', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[0].section, c[1]])).toEqual([['Country', 'Phone', 'United States of America']]);
  });
  it('a referral source missing from the list picks "Other" and says so (live Ashby)', async () => {
    const base = deps();
    const field = { id: 'wf-0', label: 'What brought you to this job posting', kind: 'select', required: false, groupIndex: 0, container: document.body };
    const fill = vi.fn().mockResolvedValueOnce('no_match').mockResolvedValueOnce('filled');
    const r = await runAutofill({ ...base, extract: () => [field], fill, map: vi.fn().mockResolvedValue(new Map([['wf-0', 'referralSource']])),
      profile: { ...emptyProfile(), referralSource: 'Company Career Website', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => c[1])).toEqual(['Company Career Website', 'not listed']);
    expect(r.missed).toEqual(['Company Career Website (picked "Other")']);
  });
  it('the follow-up box after "Other" gets the real answer, whatever the mapper said (live Ashby)', async () => {
    const base = deps();
    const at = (id: string, label: string, kind: string) => ({ id, label, kind, required: false, groupIndex: 0, container: document.body });
    const fields = [
      at('wf-0', 'What brought you to this job posting', 'select'),
      at('wf-1', 'If you responded "other" to the question above, let us know how you found this job posting', 'textarea'),
      at('wf-2', 'Anything else? Other comments', 'textarea'),
    ];
    const fill = vi.fn().mockResolvedValueOnce('no_match').mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => fields, fill, map: vi.fn().mockResolvedValue(new Map([['wf-0', 'referralSource']])),
      profile: { ...emptyProfile(), referralSource: 'Company Career Website', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'Company Career Website'], ['wf-0', 'not listed'], ['wf-1', 'Company Career Website']]);
  });
  it('a pronouns box never gets the preferred name (live Ashby: the mapper says preferredName)', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>Pronouns</label><input type="text"></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'preferredName']])),
      profile: { ...emptyProfile(), preferredName: 'Ada', reviewed: true } } as never);
    expect(fill).not.toHaveBeenCalled();
  });
  it('a "racial or ethnic background" checklist is answered with the races (live Ashby)', async () => {
    const base = deps();
    const field = { id: 'wf-0', label: 'How do you identify your racial or ethnic background?', kind: 'checkbox', required: false,
      options: ['Black', 'White'], groupIndex: 0, container: document.body };
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => [field], fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'ethnicity']])),
      profile: { ...emptyProfile(), races: 'White', reviewed: true } } as never);
    expect(fill.mock.calls[0]![1]).toEqual(['white']);
  });
  it('address line 3 and beyond never get address line 2 (live Oracle: line 3 repeated line 2)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Address Line 2</label><input type="text"></div>
      <div data-automation-id="formField-b"><label>Address Line 3</label><input type="text"></div>`;
    const fill = vi.fn().mockResolvedValue('filled');
    const r = await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'addressLine2'], ['wf-1', 'addressLine2']])),
      profile: { ...emptyProfile(), addressLine2: 'Apt. 118E', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => c[0].label)).toEqual(['Address Line 2']);
    expect(r.attention).toEqual([]);
  });
  it('never uploads to a resume-import box, which re-parses the resume over the form (live Oracle)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Import your profile from resume</label><input type="file"></div>
      <div data-automation-id="formField-b"><label>Autofill with resume</label><input type="file"></div>
      <div data-automation-id="formField-c"><label>Upload Resume</label><input type="file"></div>`;
    const fillFile = vi.fn().mockResolvedValue('filled');
    const r = await runAutofill({ ...base, extract: () => extractFields(document), fillFile,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'resumeFile'], ['wf-1', 'resumeFile'], ['wf-2', 'resumeFile']])) } as never);
    expect(fillFile.mock.calls.map((c) => c[0].label)).toEqual(['Upload Resume']);
    expect(r.attention).toEqual([]);
  });
  it('a school missing from the list gets its "Not listed / Other" option, and is reported', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>School</label><input type="text"></div>';
    const fill = vi.fn(async (_f: unknown, v: unknown) => (v === 'not listed' ? 'filled' : 'no_match'));
    const r = await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'edu.school']])),
      profile: { ...emptyProfile(), education: [{ ...emptyEdu(), school: 'Stony Brook University' }], reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => c[1])).toEqual(['Stony Brook University', 'not listed']);
    expect(r.filled).toBe(1);
    expect(r.missed).toEqual(['Stony Brook University (picked "Not listed")']);
    expect(r.attention.map((f) => f.label)).toEqual(['School']);
  });
  it('a postal code is given the city to choose among same-zip results', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>Zip Code</label><input type="text"></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'postalCode']])),
      profile: { ...emptyProfile(), postalCode: '11372', city: 'Jackson Heights', reviewed: true } } as never);
    expect(fill.mock.calls[0]![0].tieBreak).toBe('Jackson Heights');
  });
  it('a city is given the state, by name, to choose among same-name towns', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>City</label><input type="text"></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'city']])),
      profile: { ...emptyProfile(), city: 'Austin', state: 'TX', reviewed: true } } as never);
    expect(fill.mock.calls[0]![0].tieBreak).toBe('Texas');
  });
  it('a full-name or signature box gets first and last name, whatever the mapper said (live Oracle: first name only)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Full Name*</label><input type="text"></div>
      <div data-automation-id="formField-b"><label>Electronic Signature*</label><input type="text"></div>
      <div data-automation-id="formField-c"><label>First Name</label><input type="text"></div>`;
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'firstName'], ['wf-1', null], ['wf-2', 'firstName']])),
      profile: { ...emptyProfile(), firstName: 'Koyo', lastName: 'Keiter', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[1]])).toEqual([
      ['Full Name', 'Koyo Keiter'], ['Electronic Signature', 'Koyo Keiter'], ['First Name', 'Koyo'],
    ]);
  });
  it('uploads the resume once per run, never to a cover-letter box (live Oracle: resume attached twice)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Upload Resume</label><input type="file"></div>
      <div data-automation-id="formField-b"><label>Resume</label><input type="file"></div>
      <div data-automation-id="formField-c"><label>Upload Cover Letter</label><input type="file"></div>`;
    const fillFile = vi.fn().mockResolvedValue('filled');
    const r = await runAutofill({ ...base, extract: () => extractFields(document), fillFile,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'resumeFile'], ['wf-1', 'resumeFile'], ['wf-2', 'resumeFile']])) } as never);
    expect(fillFile.mock.calls.map((c) => c[0].label)).toEqual(['Upload Resume']);
    expect(r.filled).toBe(1);
    expect(r.attention).toEqual([]);
  });
  it('a resume upload that reloads the page goes first and alone (live iCIMS: the reload wiped the filled form)', async () => {
    const d = deps({ resumeFirst: true });
    const r = await runAutofill(d as never);
    expect(d.fillFile).toHaveBeenCalledTimes(1);
    expect(d.fill).not.toHaveBeenCalled();
    expect(r.reloading).toBe(true);
    expect(formatReport(r)).toMatch(/^Resume uploaded\. The page will reload/);
  });
  it('after that reload the rest is filled and the resume is not uploaded again', async () => {
    const d = deps({ resumeFirst: true, resumeDone: true });
    const r = await runAutofill(d as never);
    expect(d.fillFile).not.toHaveBeenCalled();
    expect(d.fill).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-0' }), 'Ada', undefined, []);
    expect(r.reloading).toBeUndefined();
    expect(r.attention.map((f) => f.label)).toEqual(['Favourite colour']);
  });
  it('a resume already on file does not stop the run', async () => {
    const d = deps({ resumeFirst: true, fillFile: vi.fn().mockResolvedValue('skipped_nonempty') });
    const r = await runAutofill(d as never);
    expect(r.reloading).toBeUndefined();
    expect(d.fill).toHaveBeenCalled();
  });
  it('an address type list is answered Home; a phone type list is left to the mapper (live iCIMS)', async () => {
    const base = deps();
    document.body.innerHTML = `<form>
      <label for="p">Type</label><select id="p" name="PersonProfileFields.PhoneType"><option></option><option>Home</option><option>Mobile</option></select>
      <label for="a">Type</label><select id="a" name="PersonProfileFields.AddressType"><option></option><option>Home</option><option>Other</option></select></form>`;
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractGeneric(document.querySelector('form')!), fill,
      map: vi.fn().mockResolvedValue(new Map()) } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[1]])).toEqual([['Type', 'Home']]);
    const c: HTMLElement = fill.mock.calls[0]![0].container;
    expect(c.matches('select') ? c.id : c.querySelector('select')!.id).toBe('a');
  });
  it('a phone device type list takes "Mobile" (live Workday)', async () => {
    const base = deps();
    const select = (id: string, label: string) =>
      `<div data-automation-id="formField-${id}"><label>${label}</label><button aria-haspopup="listbox" type="button">Select One</button></div>`;
    document.body.innerHTML = select('phoneType', 'Phone Device Type') + select('b', 'Phone Type') + select('c', 'Employment Type')
      + '<div data-automation-id="formField-phoneNumber"><label>Phone Number</label><input type="text"></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'phone'], ['wf-3', 'phone']])), // the mapper reads it as the number
      profile: { ...emptyProfile(), phone: '555-0100', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[1]])).toEqual([
      ['Phone Device Type', 'Mobile'], ['Phone Type', 'Mobile'], ['Phone Number', '555-0100'],
    ]);
  });
  it('standard yes/no questions are answered from the profile by their wording (live UL Solutions, PwC)', async () => {
    const qs = [
      'Are you currently 18 years of age or older?', 'Are you at least 18?',
      'Have you previously been employed by UL?', 'Have you previously completed an internship at UL?', 'Have you ever been employed by PwC?',
      'Are you related to a current UL Solutions employee?', 'Do any of your close family members currently work at PwC?',
      'Are you willing to consent to a post-offer UL background check?',
      'Are you currently employed?', 'Have you ever been convicted of a felony?', 'Have you ever worked with Python?',
      'Have you ever worked for a government agency?', // not standard
    ];
    const base = deps();
    document.body.innerHTML = qs.map((q, i) => `<div data-automation-id="formField-${i}"><label>${q}</label><input type="text"></div>`).join('');
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-2', 'workAuthorized']])), // a wrong guess the wording overrides
      profile: { ...emptyProfile(), over18: 'yes', previouslyEmployed: 'no', relatedToEmployee: 'no', backgroundCheckConsent: 'yes', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[1]])).toEqual([
      [qs[0], 'Yes'], [qs[1], 'Yes'], [qs[2], 'No'], [qs[3], 'No'], [qs[4], 'No'], [qs[5], 'No'], [qs[6], 'No'], [qs[7], 'Yes'],
    ]);
  });
  it('race checkbox lists take the races setting; a lone Hispanic checkbox follows the ethnicity (live Oracle)', async () => {
    const run = async (ethnicity: string, races: string) => {
      const base = deps();
      document.body.innerHTML = `
        <fieldset><legend>Ethnicity</legend><label><input type="checkbox">I am Hispanic or Latino.</label></fieldset>
        <fieldset><legend>Select the races you identify with.</legend>
          <label><input type="checkbox" name="r">Asian</label><label><input type="checkbox" name="r">White</label></fieldset>`;
      const fill = vi.fn().mockResolvedValue('filled');
      await runAutofill({ ...base, extract: () => extractGeneric(document.body), fill,
        map: vi.fn().mockResolvedValue(new Map([['wf-0', 'ethnicity'], ['wf-1', null]])),
        profile: { ...emptyProfile(), ethnicity, races, reviewed: true } } as never);
      return fill.mock.calls.map((c) => [c[0].label, c[1]]);
    };
    expect(await run('two or more races', 'asian, white')).toEqual([
      ['Ethnicity', 'No'], ['Select the races you identify with.', ['asian', 'white']],
    ]);
    expect(await run('hispanic or latino', '')).toEqual([['Ethnicity', 'Yes']]);
    expect(await run('asian', '')).toEqual([['Ethnicity', 'No'], ['Select the races you identify with.', ['asian']]]);
    expect(await run('decline', '')).toEqual([['Ethnicity', 'decline'], ['Select the races you identify with.', ['decline']]]);
  });
  it('a signature box holding just the first name (left by an earlier run) gets the full name; other values stay', async () => {
    const run = async (existing: string) => {
      const base = deps();
      document.body.innerHTML = `<div data-automation-id="formField-a"><label>Full Name*</label><input type="text" value="${existing}"></div>`;
      await runAutofill({ ...base, extract: () => extractFields(document), fill: (await import('../../src/fill/fillField')).fillField,
        map: vi.fn().mockResolvedValue(new Map([['wf-0', 'firstName']])),
        profile: { ...emptyProfile(), firstName: 'Koyo', lastName: 'Keiter', reviewed: true } } as never);
      return document.querySelector('input')!.value;
    };
    expect(await run('Koyo')).toBe('Koyo Keiter');
    expect(await run('K. Keiter')).toBe('K. Keiter');
  });
});
