import { describe, it, expect, vi } from 'vitest';
import { runAutofill, formatReport } from '../../src/autofill/runAutofill';
import { extractFields } from '../../src/workday/extractFields';
import { extractGeneric } from '../../src/generic/extract';
import { emptyProfile, emptyEdu } from '../../src/profile/profile';
import { greenhouse } from '../../src/greenhouse/adapter';
import { readFileSync } from 'node:fs';
import { fillGeneric } from '../../src/generic/fill';
import { today } from '../../src/fill/dateParts';

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

describe('runAutofill certifications', () => {
  const page = (required = '') => `<div role="group" data-automation-id="certificationSection">
    <div role="group"><h4>Certification 1</h4>
      <div data-automation-id="formField-a"><label>Name</label><input type="text"></div>
      <div data-automation-id="formField-b"><label>Date Expired</label><input data-automation-id="dateSectionYear-input"></div>
      <div data-automation-id="formField-c"><label>Upload proof${required}</label><input type="file"></div>
    </div></div>`;
  const certDeps = (over: Record<string, unknown> = {}) => deps({
    profile: { ...emptyProfile(), reviewed: true, certifications: [{ name: 'CISSP', number: '', issuedDate: '', expirationDate: '' }] },
    map: vi.fn().mockResolvedValue(new Map()),
    ...over,
  });
  const run = (d: ReturnType<typeof deps>, html: string) => {
    document.body.innerHTML = html;
    return runAutofill(d as never);
  };

  it('uploads the proof, never the resume', async () => {
    const proof = vi.fn().mockResolvedValue('filled');
    const d = certDeps({ proof });
    const r = await run(d, page());
    expect(proof).toHaveBeenCalledWith(expect.objectContaining({ label: 'Upload proof', groupIndex: 0 }));
    expect(d.fillFile).not.toHaveBeenCalled();
    expect(r.filled).toBe(2); // name and proof
  });
  it('the resume stays out of the box with no proof stored', async () => {
    const d = certDeps({ proof: vi.fn().mockResolvedValue(null) });
    await run(d, page());
    expect(d.fillFile).not.toHaveBeenCalled();
  });
  it('an optional empty expiry or proof is nothing to flag, so hands-free can advance', async () => {
    const r = await run(certDeps({ proof: vi.fn().mockResolvedValue(null) }), page());
    expect(r.attention).toEqual([]);
  });
  it('a required proof with none stored is flagged', async () => {
    const r = await run(certDeps({ proof: vi.fn().mockResolvedValue(null) }), page('*'));
    expect(r.attention.map((f) => f.label)).toEqual(['Upload proof']);
  });
  it('a mapper saying resume for a certification box on another site still gets the proof', async () => {
    const proof = vi.fn().mockResolvedValue('filled');
    const d = certDeps({
      proof,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'resumeFile']])),
      extract: () => extractFields(document).map((f) => { delete f.profileKey; return f; }),
    });
    await run(d, '<div data-automation-id="formField-a"><label>Certification proof</label><input type="file"></div>');
    expect(proof).toHaveBeenCalled();
    expect(d.fillFile).not.toHaveBeenCalled();
  });
});

describe('runAutofill', () => {
  it('never fills or uploads into a box the applicant cannot see', async () => {
    const d = deps();
    (document.querySelector('[data-automation-id="formField-a"]') as HTMLElement).style.opacity = '0';
    (document.querySelector('[data-automation-id="formField-d"]') as HTMLElement).style.visibility = 'hidden';
    await runAutofill(d as never);
    expect(d.fill).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-0' }), expect.anything(), undefined, expect.anything());
    expect(d.fillFile).not.toHaveBeenCalled();
  });
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
  it("fills an adapter's own answer, ahead of the mapper", async () => {
    const d = deps({ extract: () => extractFields(document).map((f) => (f.id === 'wf-2' ? { ...f, answer: true } : f)) });
    const r = await runAutofill(d as never);
    expect(d.fill).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-2' }), true, undefined, []);
    expect(r.attention).toEqual([]);
  });
  it('a birth date goes only where the adapter asks for it, never where the mapper guesses', async () => {
    const d = deps({ map: vi.fn().mockResolvedValue(new Map([['wf-0', 'firstName'], ['wf-1', 'lastName'], ['wf-2', 'dateOfBirth'], ['wf-3', 'resumeFile']])) });
    d.profile = { ...d.profile, dateOfBirth: '2001-01-31' };
    await runAutofill(d as never);
    expect(d.fill).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-2' }), '2001-01-31', undefined, []);
  });
  it('leaves a question the site has not asked yet alone: not filled, not flagged', async () => {
    const d = deps({ extract: () => extractFields(document).map((f) => (f.id === 'wf-2' ? { ...f, asked: () => false } : f)) });
    const r = await runAutofill(d as never);
    expect(d.fill).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-2' }), expect.anything(), undefined, []);
    expect(r.attention).toEqual([]);
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
  it('values a field could not take are reported; the field is highlighted unless they are skills (live RTX)', async () => {
    const run = (key: string) => runAutofill(deps({
      map: vi.fn().mockResolvedValue(new Map([['wf-0', key]])),
      profile: { ...emptyProfile(), skills: ['Rust', 'TCP/IP'], races: 'asian, white', reviewed: true },
      fill: vi.fn(async (_f: unknown, _v: unknown, _t: unknown, missed: string[]) => { missed.push('TCP/IP'); return 'filled'; }),
    }) as never);
    const skills = await run('skills');
    expect(skills.filled).toBe(2); // the skills and the resume (Workday's upload is always the resume)
    expect(skills.missed).toEqual(['TCP/IP']);
    expect(skills.attention.map((f) => f.label)).not.toContain('First Name');
    const other = await run('firstName');
    expect(other.attention.map((f) => f.label)).toContain('First Name');
    expect(other.attention.find((f) => f.label === 'First Name')!.container.dataset.wfUnfilled).toBe('1');
  });
  it('formatReport', () => {
    expect(formatReport({ filled: 3, skipped: 1, attention: [{} as never], missed: [] }))
      .toBe('Filled 3 fields. 1 already had values. 1 need your attention (highlighted). Review, then continue.');
    expect(formatReport({ filled: 3, skipped: 0, attention: [{} as never], missed: ['TCP/IP', 'Cobol'] }))
      .toBe('Filled 3 fields. 0 already had values. 1 need your attention (highlighted). Not added, fill in by hand: TCP/IP, Cobol. Review, then continue.');
    expect(formatReport({ filled: 0, skipped: 0, attention: [], missed: [] })).toBe('Found nothing to fill on this page.');
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
  it('fills unmatched questions from saved answers, then asks Gemini about the rest (blue), never about personal ones', async () => {
    const base = deps();
    document.body.innerHTML = '<div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div>';
    const box = (id: string) => document.getElementById(id)!;
    const fields = [
      { id: 'wf-0', label: 'How did you hear about us?', kind: 'radio', required: false, options: ['LinkedIn', 'Other'], groupIndex: 0, container: box('a') },
      { id: 'wf-1', label: 'Are you currently enrolled?', kind: 'radio', required: true, options: ['Yes', 'No'], groupIndex: 0, container: box('b') },
      { id: 'wf-2', label: 'Do you have experience with Splunk?', kind: 'radio', required: true, options: ['Yes', 'No'], groupIndex: 0, container: box('c') },
      { id: 'wf-3', label: 'Do you identify as transgender?', kind: 'radio', required: true, options: ['Yes', 'No'], groupIndex: 0, container: box('d') },
    ];
    const fill = vi.fn().mockResolvedValue('filled');
    const answer = vi.fn().mockResolvedValue(new Map([['wf-1', ['Yes']]]));
    const r = await runAutofill({ ...base, extract: () => fields, fill, answer, map: vi.fn().mockResolvedValue(new Map()),
      remembered: { 'radio|how did you hear about us': 'LinkedIn' } } as never);
    expect(answer.mock.calls[0]![0].map((f: { id: string }) => f.id)).toEqual(['wf-1', 'wf-2']);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'LinkedIn'], ['wf-1', 'Yes']]);
    expect(r.recalled).toBe(1);
    expect(r.answered!.map((f) => f.id)).toEqual(['wf-1']);
    expect(box('b').style.outline).toContain('#3b82f6');
    expect(r.attention.map((f) => f.id)).toEqual(['wf-3', 'wf-2']);
    expect(formatReport(r)).toBe('Filled 2 fields. 1 from your saved answers. Answered 1 for you (blue): check them. 0 already had values. 2 need your attention (highlighted). Review, then continue.');
  });
  it('asks Gemini to draft an empty essay box (blue); one already written or about pay is left alone', async () => {
    const base = deps();
    document.body.innerHTML = '<div id="a"><textarea></textarea></div><div id="b"><textarea>My own words</textarea></div><div id="c"><textarea></textarea></div>';
    const box = (id: string) => document.getElementById(id)!;
    const fields = [
      { id: 'wf-0', label: 'Why do you want to work here?', kind: 'textarea', required: true, groupIndex: 0, container: box('a') },
      { id: 'wf-1', label: 'Tell us about a project you are proud of', kind: 'textarea', required: false, groupIndex: 0, container: box('b') },
      { id: 'wf-2', label: 'Explain your salary expectations', kind: 'textarea', required: false, groupIndex: 0, container: box('c') },
    ];
    const fill = vi.fn().mockResolvedValue('filled');
    const answer = vi.fn().mockResolvedValue(new Map([['wf-0', ['Because of my work on data tools.']]]));
    // A profile key the mapper guessed for the question (and cached) must not stand in the draft's way.
    const r = await runAutofill({ ...base, extract: () => fields, fill, answer, map: vi.fn().mockResolvedValue(new Map([['wf-0', 'work.description']])) } as never);
    expect(answer.mock.calls[0]![0].map((f: { id: string }) => f.id)).toEqual(['wf-0']);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'Because of my work on data tools.']]);
    expect(r.answered!.map((f) => f.id)).toEqual(['wf-0']);
    expect(box('a').style.outline).toContain('#3b82f6');
  });
  it('needing no sponsorship answers its detail boxes N/A; a mapped choice the profile value does not fit goes to Gemini', async () => {
    const base = deps();
    const box = () => document.body.appendChild(document.createElement('div'));
    const yn = { kind: 'radio', required: false, options: ['Yes', 'No'], groupIndex: 0 };
    const fields = [
      { ...yn, id: 'wf-0', label: 'Will you require visa sponsorship?', container: box() },
      { id: 'wf-1', label: 'If yes, please specify', kind: 'text', required: false, groupIndex: 0, container: box() },
      { id: 'wf-2', label: 'What type of visa do you hold?', kind: 'textarea', required: false, groupIndex: 0, container: box() },
      { ...yn, id: 'wf-3', label: "Will you have a Bachelor's degree in CS by June 2029?", container: box() },
      { ...yn, id: 'wf-4', label: 'Are you available to start in January 2027?', container: box() },
    ];
    const fill = vi.fn(async (f: { id: string; options?: string[] }, v: string) => (f.options && !f.options.includes(v) ? 'no_match' : 'filled'));
    const answer = vi.fn().mockResolvedValue(new Map([['wf-3', ['Yes']]]));
    const r = await runAutofill({ ...base, extract: () => fields, fill, answer,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'requiresSponsorship'], ['wf-3', 'edu.degree'], ['wf-4', 'earliestStartDate']])),
      profile: { ...emptyProfile(), requiresSponsorship: 'no', education: [{ ...emptyEdu(), degree: 'BS', endDate: '2029-05' }], reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'No'], ['wf-1', 'N/A'], ['wf-2', 'N/A'], ['wf-3', 'BS'], ['wf-3', 'Yes']]);
    expect(answer.mock.calls[0]![0].map((f: { id: string }) => f.id)).toEqual(['wf-3', 'wf-4']);
    expect(r.answered!.map((f) => f.id)).toEqual(['wf-3']);
    expect(r.attention.map((f) => f.id)).toEqual(['wf-4']); // no start date in the profile: still highlighted
  });
  it('ticks a required consent box and says so; an optional one is left to the applicant', async () => {
    const base = deps();
    const box = () => document.body.appendChild(document.createElement('div'));
    const fields = [
      { id: 'wf-0', label: 'The Adobe family of companies may keep me informed with personalized emails', kind: 'checkbox', required: true, groupIndex: 0, container: box() },
      { id: 'wf-1', label: 'Send me the newsletter', kind: 'checkbox', required: false, groupIndex: 0, container: box() },
      // The mapper's guesses for a consent sentence must not decide it: a profile "yes" ticked the optional box, a "no" left the required one.
      { id: 'wf-2', label: 'Keep me informed about opportunities', kind: 'checkbox', required: false, groupIndex: 0, container: box() },
      { id: 'wf-3', label: 'Yes, I have read and consent to the terms and conditions', kind: 'checkbox', required: true, groupIndex: 0, container: box() },
      { id: 'wf-4', label: 'I currently work here', kind: 'checkbox', required: false, groupIndex: 0, container: box() },
    ];
    const fill = vi.fn().mockResolvedValue('filled');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const r = await runAutofill({ ...base, extract: () => fields, fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-2', 'over18'], ['wf-3', 'workAuthorized'], ['wf-4', 'work.current']])),
      profile: { ...emptyProfile(), over18: 'yes', workAuthorized: 'no', reviewed: true,
        work: [{ title: '', company: '', location: '', startDate: '', endDate: '', current: true, description: '' }] } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', true], ['wf-3', true], ['wf-4', true]]);
    expect(fields[0]!.container.style.outline).toContain('#3b82f6');
    expect(r.attention).toEqual([]);
    expect(formatReport(r)).toBe('Filled 3 fields. Ticked 2 required consent boxes (blue): read what you are agreeing to. 0 already had values. 0 need your attention (highlighted). Review, then continue.');
  });
  it('reuses a written answer the applicant typed before instead of asking Gemini for a draft', async () => {
    const base = deps();
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const fields = [
      { id: 'wf-0', label: 'Please list three other departments you would be interested in:', kind: 'textarea', required: true, groupIndex: 0, container: document.getElementById('a')! },
      { id: 'wf-1', label: 'Describe a project you are proud of.', kind: 'textarea', required: true, groupIndex: 0, container: document.getElementById('b')! },
    ];
    const fill = vi.fn().mockResolvedValue('filled');
    const answer = vi.fn().mockResolvedValue(new Map());
    const r = await runAutofill({ ...base, extract: () => fields, fill, answer, map: vi.fn().mockResolvedValue(new Map()),
      remembered: { 'textarea|please list three other departments you would be interested in': 'Sales, Finance, Marketing' } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'Sales, Finance, Marketing']]);
    expect(answer.mock.calls.map(([q]) => q.map((f: { id: string }) => f.id))).toEqual([['wf-1']]); // only the new question gets a draft
    expect(r.attention.map((f) => f.id)).toEqual(['wf-1']);
  });
  it('a Gemini failure leaves the leftovers highlighted and says why', async () => {
    const base = deps();
    const field = { id: 'wf-0', label: 'Are you currently enrolled?', kind: 'radio', required: true, options: ['Yes', 'No'], groupIndex: 0, container: document.body };
    const r = await runAutofill({ ...base, extract: () => [field], map: vi.fn().mockResolvedValue(new Map()),
      answer: vi.fn().mockRejectedValue(new Error('Gemini free-tier limit hit. Wait a minute and retry.')) } as never);
    expect(r.attention).toHaveLength(1);
    expect(formatReport(r)).toContain('Gemini could not answer the rest: Gemini free-tier limit hit.');
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
  it('a degree question is the degree, not the field of study the mapper says (live Workday RTX)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>What is your Current Degree Program?*</label><button aria-haspopup="listbox">Select One</button></div>
      <div data-automation-id="formField-b"><label>Field of study for your degree</label><input type="text"></div>`;
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'edu.fieldOfStudy'], ['wf-1', 'edu.fieldOfStudy']])),
      profile: { ...emptyProfile(), education: [{ ...emptyEdu(), degree: 'Bachelor of Science', fieldOfStudy: 'Computer Science' }], reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-0', 'Bachelor of Science'], ['wf-1', 'Computer Science']]);
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
  it('an address line is given the ZIP to choose among the same street in other states', async () => {
    const base = deps();
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>Address Line 1</label><input type="text"></div>';
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'addressLine1']])),
      profile: { ...emptyProfile(), addressLine1: '74-12 35th Ave', postalCode: '11372', reviewed: true } } as never);
    expect(fill.mock.calls[0]![0].tieBreak).toBe('11372');
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
  it('a resume already on the page is the step\'s resume; extra-document boxes never get it (live Oracle)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Resume</label><input type="file"></div>
      <div data-automation-id="formField-b"><label>Upload a file</label><input type="file"></div>
      <div data-automation-id="formField-c"><label>Additional Documents</label><input type="file"></div>`;
    const fillFile = vi.fn().mockResolvedValueOnce('skipped_nonempty').mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fillFile,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'resumeFile'], ['wf-1', 'resumeFile'], ['wf-2', 'resumeFile']])) } as never);
    expect(fillFile.mock.calls.map((c) => c[0].label)).toEqual(['Resume']);
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>Miscellaneous Documents</label><input type="file"></div>';
    const fresh = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fillFile: fresh,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'resumeFile']])) } as never);
    expect(fresh).not.toHaveBeenCalled();
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
  it('the federal disability form: its unlabelled choices, the signing name and today\'s date (live JazzHR)', async () => {
    const base = deps();
    document.body.innerHTML = `<form><div id="disability-input-area">
      <div class="centered-message box-message"><div class="resumator-label">Please check one of the boxes below:</div></div>
      <div class="resumator-input"><div class="form-group">
        <label><input type="radio" name="resumator-eeoc_disability-value" id="d1" value="1"> YES, I HAVE A DISABILITY, OR HAVE HAD ONE IN THE PAST</label>
        <label><input type="radio" name="resumator-eeoc_disability-value" id="d2" value="2"> NO, I DO NOT HAVE A DISABILITY AND HAVE NOT HAD ONE IN THE PAST</label>
        <label><input type="radio" name="resumator-eeoc_disability-value" id="d0" value="0"> I DO NOT WANT TO ANSWER</label>
      </div>
      <p>PUBLIC BURDEN STATEMENT: …</p>
      <table id="disability-signature-area" class="form-group"><tr>
        <td><label for="sig">Name<input type="text" id="sig" class="resumator-field" value=""></label></td>
        <td><label for="date">Date<input type="text" id="date" class="resumator-field resumator-datepicker" maxlength="10" value=""></label></td>
      </tr></table></div></div></form>`;
    const r = await runAutofill({ ...base, profile: { ...base.profile, disabilityStatus: 'no' }, extract: () => extractGeneric(document.querySelector('form')!),
      fill: fillGeneric, map: vi.fn().mockResolvedValue(new Map([['wf-1', 'firstName']])) } as never);
    expect(r.log!.slice(0, 3).map((l) => l.split(' | ')[1])).toEqual(['Disability status', 'Name', 'Date']);
    expect((document.getElementById('d2') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('sig') as HTMLInputElement).value).toBe('Ada L');
    expect((document.getElementById('date') as HTMLInputElement).value).toBe(today()); // the calendar's own yy-mm-dd
    expect(r.filled).toBe(3);
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
      'Are you related to a current UL Solutions employee?', 'Do any of your close family members currently work at PwC?', 'Do you have any relatives working at STMicroelectronics?', 'Are you related to anyone that works for Hubbell?',
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
      [qs[0], 'Yes'], [qs[1], 'Yes'], [qs[2], 'No'], [qs[3], 'No'], [qs[4], 'No'], [qs[5], 'No'], [qs[6], 'No'], [qs[7], 'No'], [qs[8], 'No'], [qs[9], 'Yes'],
    ]);
  });
  it('U.S. citizenship and federal employment are answered from the profile by their wording (live RTX)', async () => {
    const qs = ['Are you a citizen of the United States?', 'Are you a CURRENT U.S. federal government civilian or military (active duty or reserves) employee?',
      'Are you a FORMER U.S. federal government civilian or military (active duty or reserves) employee?', 'Are you a U.S. citizen?'];
    const base = deps();
    document.body.innerHTML = qs.map((q, i) => `<div data-automation-id="formField-${i}"><label>${q}</label><button aria-haspopup="listbox">Select One</button></div>`).join('');
    const fill = vi.fn().mockResolvedValue('filled');
    await runAutofill({ ...base, extract: () => extractFields(document), fill, map: vi.fn().mockResolvedValue(new Map()),
      profile: { ...emptyProfile(), usCitizen: 'yes', governmentEmployee: 'no', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => c[1])).toEqual(['Yes', 'No', 'No', 'Yes']);
  });
  it('a yes/no key the question is not about is dropped (live RTX: "CURRENT federal ... employee?" answered Yes)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-a"><label>Are you a CURRENT U.S. federal government civilian or military (active duty or reserves) employee?*</label><button aria-haspopup="listbox">Select One</button></div>
      <div data-automation-id="formField-b"><label>Are you legally authorized to work in the United States?*</label><button aria-haspopup="listbox">Select One</button></div>`;
    const fill = vi.fn().mockResolvedValue('filled');
    const r = await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'workAuthorized'], ['wf-1', 'workAuthorized']])),
      profile: { ...emptyProfile(), workAuthorized: 'yes', reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([['wf-1', 'Yes']]);
    expect(r.attention.map((f) => f.id)).toEqual(['wf-0']);
  });
  it('a field the site already answered, or an optional box left unticked, needs no attention without a profile value (live RTX)', async () => {
    const base = deps();
    document.body.innerHTML = `
      <div data-automation-id="formField-countryPhoneCode"><label>Country Phone Code</label><input type="text"><div data-automation-id="selectedItem">United States of America (+1)</div></div>
      <div data-automation-id="formField-preferredCheck"><label>I have a preferred name</label><input type="checkbox"></div>`;
    const fill = vi.fn().mockResolvedValue('filled');
    const report = await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map([['wf-0', 'country'], ['wf-1', 'preferredName']])),
      profile: { ...emptyProfile(), reviewed: true } } as never);
    expect(fill).not.toHaveBeenCalled();
    expect(report.attention).toEqual([]);
    expect(report.skipped).toBe(1); // the phone code; the optional box is simply left alone
  });
  it('a previously-worked-here question defaults to No when the profile leaves it unset (live Workday)', async () => {
    const qs = ['Have you previously worked for Fidelity Investments?', 'Have you worked for Acme Corp before?',
      'Have you ever been an employee of Acme or its subsidiaries?', 'Have you previously worked here?',
      'Have you ever worked for a government agency?']; // last: not about this company
    const base = deps();
    document.body.innerHTML = qs.map((q, i) => `<div data-automation-id="formField-${i}"><label>${q}</label><input type="text"></div>`).join('');
    const fill = vi.fn().mockResolvedValue('filled');
    const report = await runAutofill({ ...base, extract: () => extractFields(document), fill,
      map: vi.fn().mockResolvedValue(new Map()), profile: { ...emptyProfile(), reviewed: true } } as never);
    expect(fill.mock.calls.map((c) => [c[0].label, c[1]])).toEqual(qs.slice(0, 4).map((q) => [q, 'No']));
    expect(report.filled).toBe(4);
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
