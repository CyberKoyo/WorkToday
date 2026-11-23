// @vitest-environment happy-dom
// One harness for every hosted platform the generic reader handles (src/hosted): a live capture of its application form
// (test/fixtures/real-<id>-apply.html, 2026-11-22; iframes and image sources stripped), the URL that picks it, the
// fields it must read, and one fill of each widget kind the form uses.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { pickAdapter } from '../../src/ats/registry';
import { CONTENT_MATCHES } from '../../src/ats/matches';
import type { ExtractedField } from '../../src/ats/field';
import type { ProfileValue } from '../../src/profile/profile';

type Want = [label: string | RegExp, kind: ExtractedField['kind'], required?: boolean];
interface Platform {
  id: string; url: string;
  fields: Want[]; // in page order; others may sit between them
  fill?: Array<[label: RegExp, value: ProfileValue, check: (f: ExtractedField) => unknown, expected: unknown]>;
}

const value = (f: ExtractedField) => f.container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]),select,textarea')?.value
  ?? (f.container as HTMLInputElement).value;
const checked = (f: ExtractedField) => f.members?.map((m) => (m as HTMLInputElement).checked).indexOf(true);

const PLATFORMS: Platform[] = [
  { id: 'workable', url: 'https://apply.workable.com/rokt/j/616F2D0286/apply/',
    fields: [['First name', 'text', true], ['Last name', 'text', true], ['Email', 'text', true], ['Phone', 'text', false], ['Resume', 'file', true],
      [/require sponsorship to work for Rokt/, 'radio', true], [/legally authorized to work in the United States/, 'radio', true]],
    fill: [[/^First name$/, 'Ada', value, 'Ada'], [/require sponsorship/, false, checked, 1]] },
  { id: 'jazzhr', url: 'https://h2oai.applytojob.com/apply/QwA3SV58KB/Software-Engineer',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email Address', 'text', true], ['Phone', 'text', true],
      ['City', 'text'], ['State/Province', 'text'], ['Postal', 'text'], ['Resume', 'file', true], [/U\.S\. work authorization status/, 'select', true]],
    fill: [[/^City$/, 'Austin', value, 'Austin']] },
  { id: 'recruitee', url: 'https://constructivedialogue.recruitee.com/o/software-engineer-early-career/c/new',
    fields: [['Full name', 'text', true], ['Email address', 'text', true], ['Phone number', 'text', true], ['CV or resume', 'file', true],
      [/require sponsorship for employment visa status/, 'radio', true], ['How did you hear about this role?', 'text', false]],
    fill: [[/^Full name$/, 'Ada Lovelace', value, 'Ada Lovelace'], [/require sponsorship/, false, checked, 1]] },
  { id: 'paylocity', url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Apply/4675098',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email Address', 'text', true], ['Country', 'text', true],
      ['City', 'text', true], ['State', 'text', true], ['Zip Code', 'text', true], ['How did you hear about us?', 'radio', true]],
    fill: [[/^City$/, 'Austin', value, 'Austin']] },
  { id: 'gem', url: 'https://jobs.gem.com/nominal/am9icG9zdDrlabSm0ds9wVUTkb9GHr37',
    fields: [['First name', 'text', true], ['Last name', 'text', true], ['Email', 'text', true], ['LinkedIn URL', 'text', true], ['Resume', 'file', true],
      ['Cover letter', 'file'], [/Are you authorized to work in the United States/, 'radio', true]],
    fill: [[/^First name$/, 'Ada', value, 'Ada'], [/authorized to work in the United States/, true, checked, 0]] },
  { id: 'breezy', url: 'https://victory.breezy.hr/p/72dd7a10bea3-staff-software-engineer/apply',
    fields: [['Resume', 'file', true], ['Full Name', 'text', true], ['Email Address', 'text', true], ['Phone Number', 'text', true], ['Address', 'text', false],
      ['Gender', 'radio', true]],
    fill: [[/^Full Name$/, 'Ada Lovelace', value, 'Ada Lovelace']] },
  { id: 'pinpoint', url: 'https://pexcard.pinpointhq.com/postings/288e25a7-28b6-4705-ad8c-f8b0d55ac09c/applications/new',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email Address', 'text', true], ['Phone', 'text', false],
      ['Attach Résumé / CV', 'file', false], ['Gender', 'select'], ['Allow us to process your personal information.', 'checkbox', true]],
    fill: [[/^Email Address$/, 'ada@example.com', value, 'ada@example.com']] },
  { id: 'rippling', url: 'https://ats.rippling.com/skillable-careers/jobs/ac46ccb4-e6a6-4ce0-bf8d-e573c971d173/apply?step=application',
    fields: [[/résumé/, 'file'], ['First name', 'text', true], ['Last name', 'text', true], ['Email', 'text', true], ['Phone number', 'text', true],
      ['LinkedIn Link', 'text', true], ['Cover letter', 'file'], [/^Are you legally authorized to work in the U\.S\.\?$/, 'select', true]],
    fill: [[/^Last name$/, 'Lovelace', value, 'Lovelace']] },
  { id: 'teamtailor', url: 'https://ensek.teamtailor.com/jobs/8657790-principal-data-engineer',
    fields: [['Do you currently have Right to work in the UK?', 'radio', true], ['Desired Salary?', 'text', true], ['First name', 'text', true],
      ['Last name', 'text', true], ['Email', 'text', true], ['Phone', 'text', false], ['Upload CV', 'file', true]],
    fill: [[/^Email$/, 'ada@example.com', value, 'ada@example.com'], [/Right to work/, 'Yes', checked, 0]] },
  { id: 'bamboohr', url: 'https://semble.bamboohr.com/careers/201',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email', 'text', true], ['Phone', 'text', true], ['City', 'text', true],
      ['LinkedIn URL', 'text', true], [/right to work in the country/, 'radio', true]],
    fill: [[/^City$/, 'Austin', value, 'Austin'], [/right to work/, true, checked, 0]] },
  { id: 'personio', url: 'https://tanso.jobs.personio.de/job/2523209/apply?language=en',
    fields: [['First name', 'text'], ['Last name', 'text'], ['Email', 'text', true], ['Phone', 'text', true], ['LinkedIn', 'text', false],
      [/level of English/, 'select', true], ['CV', 'file', true], ['Cover letter', 'file', false]],
    fill: [[/^First name$/, 'Ada', value, 'Ada']] },
  { id: 'jobvite', url: 'https://jobs.jobvite.com/nlight/job/oYw3AfwR/apply',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email', 'text', true], ['City', 'text'], ['State', 'select', true], ['Zip', 'text']],
    fill: [[/^Zip$/, '78701', value, '78701']] },
  // Web components: the form renders inside a shadow root (saved as <template shadowrootmode>).
  { id: 'ukg', url: 'https://recruiting.ultipro.com/APP1010ARAI/JobBoard/07442cec-d18e-4589-ab15-8342edc29af7/QuickApply?opportunityId=844313ee-2c6e-4ccf-9bc2-9a70ad48efd6',
    fields: [['First name', 'text', true], ['Last name', 'text', true], ['Phone number', 'text', true], ['Email ID', 'text']],
    fill: [[/^First name$/, 'Ada', value, 'Ada']] },
  { id: 'adpwfn', url: 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=4368bc58-6c54-479e-b56b-f19037b54073&jobId=578942',
    fields: [['First Name', 'text', true], ['Last Name', 'text', true], ['Email', 'text', true], ['Mobile Number', 'text']],
    fill: [[/^Email$/, 'ada@example.com', value, 'ada@example.com']] },
  // The guest step before the application ("Getting You Started"), its form under aria-hidden.
  { id: 'paycom', url: 'https://paycomonline.net/v4/ats/web.php/portal/ffa4c5ee7003c56e6918c33281b4ad02/jobs/140389',
    fields: [['Legal First Name', 'text', true], ['Legal Last Name', 'text', true], ['Email Address', 'text', true], ['Confirm Email', 'text', true]],
    fill: [[/^Legal First Name$/, 'Ada', value, 'Ada']] },
  { id: 'freshteam', url: 'https://nline.freshteam.com/jobs/CG7i7gR_0mc8/principal-engineer',
    fields: [['Apply With Resume', 'file', true], ['First Name', 'text', true], ['Last Name', 'text', true], ['Email', 'text', true], ['Phone', 'text', true],
      [/^Social Network and Web Links/, 'text'], ['Cover Letter', 'file', true]],
    fill: [[/^Phone$/, '5550100', value, '5550100']] },
  { id: 'jobscore', url: 'https://careers.jobscore.com/apply_flow/standard_applications/apply?job_id=bW_zcwD0fi9BAyQTI_70PU',
    fields: [['First Name:', 'text', true], ['Last Name:', 'text', true], ['Email:', 'text', true], ['City:', 'text', true],
      ['State or Province:', 'select', true], ['Work Authorization:', 'select', true],
      ['Are you a current employee of Finalsite?', 'checkbox', true], ['Are you willing and able to work EST hours?', 'checkbox', true]],
    fill: [[/^City:$/, 'Austin', value, 'Austin'], [/current employee of Finalsite/, ['No, I have never worked for Finalsite.'], checked, 3]] },
  { id: 'homerun', url: 'https://jobs.homerun.co/open/en/apply?&step=1',
    fields: [['First name', 'text', true], ['Last name', 'text', true], ['E-mail address', 'text', true], ['City', 'text'], ['LinkedIn', 'text'],
      ['Would you like to share a PDF résumé or portfolio?', 'file']],
    fill: [[/^LinkedIn$/, 'https://www.linkedin.com/in/ada', value, 'https://www.linkedin.com/in/ada']] },
  { id: 'manatal', url: 'https://manatal.careers-page.com/jobs/6da53b4c-ccd7-4b0f-a171-d7ea493d08c3/apply',
    fields: [['What is your full name?', 'text', true], ['What is your phone number?', 'text', true], ['What is your email address?', 'text', true],
      ['Resume', 'file', true], ['Add cover letter', 'textarea']],
    fill: [[/full name/, 'Ada Lovelace', value, 'Ada Lovelace']] },
  { id: 'comeet', url: 'https://www.comeet.co/jobs/43.001/7D.07A/apply?token=34110453411D4968234168209C31D49',
    fields: [['First name', 'text', true], ['Last name', 'text', true], ['Email', 'text', true], ['Phone', 'text', true], ['Resume', 'file', true],
      ['Cover Letter', 'file']],
    fill: [[/^Email$/, 'ada@example.com', value, 'ada@example.com']] },
];

// Chrome's match-pattern rules, enough for the patterns in matches.ts.
const covers = (pattern: string, url: URL) => {
  const m = /^(https):\/\/([^/]+)(\/.*)$/.exec(pattern)!;
  const host = m[2]!.startsWith('*.') ? new RegExp(`(^|\\.)${m[2]!.slice(2).replace(/\./g, '\\.')}$`) : new RegExp(`^${m[2]!.replace(/\./g, '\\.')}$`);
  const path = new RegExp(`^${m[3]!.replace(/[.?+()]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return url.protocol === `${m[1]}:` && host.test(url.hostname) && path.test(url.pathname + url.search);
};

// A saved shadow root comes back as <template shadowrootmode>, which innerHTML leaves as a template.
function hydrate(n: ParentNode) {
  for (const t of [...n.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode]')]) {
    const host = t.parentElement!;
    if (host.shadowRoot) continue;
    const root = host.attachShadow({ mode: 'open' });
    root.append(t.content);
    t.remove();
    hydrate(root);
  }
}
const load = (id: string) => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-${id}-apply.html`, 'utf8'); hydrate(document.body); };
const matches = (f: ExtractedField, l: string | RegExp) => (typeof l === 'string' ? f.label === l : l.test(f.label));

describe.each(PLATFORMS)('$id (live capture)', ({ id, url, fields, fill }) => {
  const u = new URL(url);
  const adapter = pickAdapter(u)!;

  it('is picked by its URL, and the content script runs there', () => {
    expect(adapter?.id).toBe(id);
    expect(CONTENT_MATCHES.some((p) => covers(p, u))).toBe(true);
  });
  it('shows the banner on the form', () => {
    load(id);
    expect(adapter.isFormPage(document)).toBe(true);
  });
  it('reads the fields that matter, in order', () => {
    load(id);
    const got = adapter.extract(document);
    let at = 0;
    for (const [label, kind, required] of fields) {
      const i = got.findIndex((f, n) => n >= at && matches(f, label));
      expect(i, `${String(label)} missing or out of order`).toBeGreaterThanOrEqual(0);
      expect([got[i]!.kind, required === undefined ? undefined : got[i]!.required]).toEqual([kind, required]);
      at = i + 1;
    }
    expect(new Set(got.map((f) => f.id)).size).toBe(got.length);
  });
  if (fill) {
    it.each(fill)('fills %s', async (label, v, check, expected) => {
      load(id);
      const f = adapter.extract(document).find((x) => label.test(x.label))!;
      expect(await adapter.fill(f, v, 200)).toBe('filled');
      expect(check(f)).toBe(expected);
    });
  }
});

describe('hosted listing', () => {
  // The question's <label> wraps the whole group: Chrome ignores a click that starts on a radio inside it, happy-dom
  // passes it on to the first radio, so the click itself is what is checked here.
  it('paylocity: clicks the radio that matches', async () => {
    load('paylocity');
    const a = pickAdapter(new URL('https://recruiting.paylocity.com/Recruiting/Jobs/Apply/4675098'))!;
    const f = a.extract(document).find((x) => /How did you hear/.test(x.label))!;
    const click = vi.spyOn(f.members![1]!, 'click');
    expect(await a.fill(f, 'Company Website', 200)).toBe('filled');
    expect(click).toHaveBeenCalledOnce();
  });
  it('is not picked on a job list without a form', () => {
    document.body.innerHTML = '<form role="search"><input name="q" placeholder="Search jobs"></form><a href="/jobs/1">Engineer</a>';
    expect(pickAdapter(new URL('https://ensek.teamtailor.com/jobs'))!.isFormPage(document)).toBe(false);
  });
  it('BambooHR only on its careers pages, not the app', () => {
    expect(pickAdapter(new URL('https://acme.bamboohr.com/home'))).toBeNull();
  });
});
