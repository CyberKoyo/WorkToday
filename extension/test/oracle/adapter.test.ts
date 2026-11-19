import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { oracle } from '../../src/oracle/adapter';

const CX = '/hcmUI/CandidateExperience/en/sites/CX_1/job/123';
const load = (path: string) => {
  history.pushState({}, '', path);
  document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/oracle-apply.synthetic.html`, 'utf8');
};

// [label, kind, required]; required read from the label class input-row__label--required.
const EXPECTED_ORACLE_APPLY: Array<[string, string, boolean]> = [
  ['Import your profile from resume', 'file', false],
  ['Last Name', 'text', true],
  ['First Name', 'text', false],
  ['Title', 'radio', false],
  ['Middle Name', 'text', false],
  ['Email Address', 'text', false],
  ['Phone Number', 'select', false],
  ['Phone Number', 'text', false],
  ['Gender', 'select', true],
  ['Date of Birth', 'select', true],
  ['Date of Birth', 'select', true],
  ['Date of Birth', 'select', true],
  ['Marital Status', 'select', true],
  ['Country', 'select', true],
  ['Address Line 1', 'select', true],
  ['Address Line 2', 'text', false],
  ['ZIP Code', 'text', true],
  ['City', 'text', true],
  ['State', 'text', true],
  ['County', 'text', true],
  ['Have you ever been involved in the commission of any act of sexual harassment or sexual exploitation and abuse?', 'radio', true],
  ['Are any of your immediate relatives (Mother, Father, Sister, Brother, Daughter, Son) currently working with UNDP?', 'radio', true],
  ['Do you currently work for any organization within the UN Common System (for example, UNDP, UNFPA, UNW, ICAO, WMO, UNFCCC, WHO, UNICEF)?', 'radio', true],
  ['Have you ever been imposed disciplinary measures, including dismissal or separation from service, on the grounds of misconduct?', 'radio', true],
  ['Have you ever been arrested, indicted, or summoned into court as a defendant in a criminal proceeding, or convicted, fined or imprisoned for the violation of any law (excluding minor traffic violations)?', 'radio', true],
  ['Have you resigned or separated from the UN Common System while under investigation or in the course of disciplinary proceedings action?', 'radio', true],
  ['Have you ever been separated from service on the ground of unsatisfactory performance from UN Common System?', 'radio', true],
  ['Are you now, or have you ever been, a permanent civil servant employee in your government?', 'radio', true],
  ['If you are/were a UN Common System Staff member, please indicate your UN Index Number. If not please indicate with N/A.', 'textarea', true],
  ['Please identify your relevant experience in years with regards to the vacancy you\'re applying for', 'select', true],
  ['Please identify your highest education level', 'radio', true],
  ['Please provide any other details that might be relevant for this application.', 'textarea', true],
  ['Do you need any reasonable accommodation to support your participation in the recruitment and selection process?', 'radio', true],
  ['Are you one of the following: (1) a Permanent Resident of the United States, OR (2) a holder of a valid G4 visa, OR (3) a US citizen?', 'radio', true],
  ['How did you hear about this job opportunity?', 'radio', true],
  ['Your online application form must be fully completed. You understand that failure in doing so disqualifies you from the recruitment and selection process. You also understand that once your application is submitted, it cannot be edited.', 'radio', true],
  ['Conflict of Interest declaration: Do you have any Immediate Family Member or Relative who is currently employed by a national government as a staff member or is an elected or appointed government official, or is a public or civil servant?', 'textarea', true],
  ['Conflict of Interest declaration: Do you have any Immediate Family Members or Relatives who hold any executive, leadership or policy-making role in any non-UNDP entity including, but not limited to, any NGO, intergovernmental entity, non-profit, for profit, charity, or academic institution (e.g., membership on corporate or advisory boards, or as a trustee of such entity)?', 'textarea', true],
  ['Conflict of Interest declaration: Do you now hold (or have held at any time in the past) any executive, leadership or policy-making role in any non-UNDP entity including, but not limited to, any NGO, intergovernmental entity, non-profit, for profit, charity, or academic institution (e.g., membership on corporate or advisory boards, or as a trustee of such entity)?', 'textarea', true],
  ['Conflict of Interest declaration: Are you now, or have you ever been involved in any other activity which could be potentially viewed as influencing your objectivity or independence in the performance of the functions of the position for which you have been recruited/contracted by UNDP, or which could otherwise negatively affect the image of UNDP?', 'textarea', true],
  ['Conflict of Interest declaration: Do you have any Immediate Family Member or Relative who is currently employed by a UNDP vendor, supplier, provider, partner, agent, NGO or contractor/consultant, or by an individual or entity that seeks to have or currently maintains a business relationship with UNDP, not previously disclosed pursuant to the foregoing questions?', 'textarea', true],
  ['Conflict of Interest declaration: If hired by UNDP, will you maintain any full or part-time employment with any entity other than UNDP?', 'textarea', true],
  ['Conflict of Interest declaration: Do you or any Immediate Family Member or Relative have any financial or other ownership interest in, or affiliation with, any entity with which you may be required to have official dealings on behalf of UNDP, or which has a commercial interest in the work of UNDP, or a common area of activity with UNDP?', 'textarea', true],
  ['Have you any objections to our making inquiries of your present or previous employer?', 'radio', true],
  ['Are you placed on a Roster with the UN Common System?', 'radio', true],
  ['Are you now, or have you ever been, a permanent civil servant employee in your government?', 'radio', true],
  ['Are you a current or former UN Volunteer?', 'radio', true],
  ['List any significant publications you have written (do not attach them) or any special recognition:', 'textarea', true],
  ['List membership of professional societies and activities in civic, public or international affairs:', 'textarea', true],
  ['Are you willing to accept assignments of less than one year?', 'radio', true],
  ['Are you enrolled in the final academic year of a first university degree programme (such as bachelor’s degree or equivalent)?', 'radio', true],
  ['Have you recently graduated with a university degree (master’s programme or bachelor’s degree or equivalent? Please indicate date/month/year of graduation?', 'textarea', true],
  ['Are you enrolled in a postgraduate professional traineeship program and would like to undertake the internship as part of this program?', 'radio', true],
  ['Upload Resume', 'file', false],
  ['Upload Cover Letter', 'file', true],
  ['Link 1', 'text', false],
  ['Full Name', 'text', true],
];

beforeEach(() => load(`${CX}/apply/section/1`));

describe('oracle adapter', () => {
  it('detects Oracle Recruiting Cloud only', () => {
    expect(oracle.detect(new URL(`https://abcd.fa.us2.oraclecloud.com${CX}/apply/section/1`))).toBe(true);
    expect(oracle.detect(new URL('https://abcd.fa.us2.oraclecloud.com/fscmUI/faces/FuseWelcome'))).toBe(false);
    expect(oracle.detect(new URL(`https://oraclecloud.com.evil.example${CX}`))).toBe(false);
  });
  it('form page only on apply routes', () => {
    expect(oracle.isFormPage(document)).toBe(true);
    load(CX);
    expect(oracle.isFormPage(document)).toBe(false);
  });
  it('extracts the apply flow', () => {
    const f = oracle.extract(document);
    expect(f.map((x) => [x.label, x.kind, x.required, x.section])).toEqual([
      ['First Name', 'text', true, 'Contact Information'],
      ['Last Name', 'text', true, 'Contact Information'],
      ['Email Address', 'text', false, 'Contact Information'],
      ['Country', 'select', false, 'Contact Information'],
      ['Will you now or in the future require sponsorship?', 'radio', false, 'Application Questions'],
      ['Start Date', 'text', false, 'Education'],
    ]);
    expect(f[4]!.options).toEqual(['Yes', 'No']);
  });
  it('step key follows the route and first section', () => {
    expect(oracle.stepKey(document)).toBe(`${CX}/apply/section/1|Contact Information`);
  });
  it('fills a date in the placeholder format', async () => {
    const start = oracle.extract(document)[5]!;
    expect(await oracle.fill(start, '2019-09')).toBe('filled');
    expect((document.getElementById('sd') as HTMLInputElement).value).toBe('09/2019');
  });
  it('real capture: apply flow section 1', () => {
    load('/hcmUI/CandidateExperience/en/sites/CX_1/job/37322/apply/section/1/');
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-oracle-apply.html`, 'utf8');
    expect(oracle.isFormPage(document)).toBe(true);
    const f = oracle.extract(document);
    expect(f.map((x) => [x.label, x.kind, x.required])).toEqual(EXPECTED_ORACLE_APPLY);
  }, 20000);

  it('real capture: Rockland Trust apply flow, role="radio" pills (live 2026-11-02)', () => {
    load('/hcmUI/CandidateExperience/en/sites/CX_3001/job/3038/apply/section/1/');
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-oracle-rockland.html`, 'utf8');
    const f = oracle.extract(document);
    // Label tails: some questions carry a long disclaimer in front of the question itself.
    expect(f.map((x) => [x.label.slice(-40), x.kind, x.required])).toEqual([
      ['Import your profile from resume', 'file', false],
      ['Last Name', 'text', true],
      ['First Name', 'text', true],
      ['Preferred Name', 'text', true],
      ['Title', 'radio', false],
      ['Middle Name', 'text', false],
      ['Email Address', 'text', false],
      ['Phone Number', 'select', false],
      ['Phone Number', 'text', false],
      ['Country', 'select', true],
      ['Address Line 1', 'select', true],
      ['Address Line 2', 'text', false],
      ['City', 'select', true],
      ['State', 'select', true],
      ['Postal Code', 'select', true],
      ['ns, affray or disturbance of the peace.)', 'radio', true],
      ['ave you ever been convicted of a felony?', 'radio', true],
      ['Are you 18 years or older?', 'radio', true],
      [' permitted to work in the United States?', 'radio', true],
      ['u previously employed by Rockland Trust?', 'radio', true],
      ['How were you referred to us?', 'radio', true],
      ['garding your referral to Rockland Trust.', 'textarea', true],
      ['Upload Cover Letter', 'file', false],
      ['Link 1', 'text', false],
      ['Willing to Relocate', 'radio', false],
      ['Consider Temporary Assignment', 'radio', false],
      ['Consider Part Time Work', 'radio', false],
      ['Pay Expectations', 'text', false],
      ['Currency Code', 'select', true],
      ['Pay Frequency', 'radio', true],
      ['Ethnicity', 'checkbox', false],
      ['Select the races you identify with.', 'checkbox', false],
      ['Gender', 'select', false],
      ['Veteran Status', 'select', false],
      ['ive updates about new job opportunities.', 'checkbox', false],
      ['gree to receive marketing communications', 'checkbox', false],
      ['Full Name', 'text', true],
    ]);
    expect(f[20]!.options).toEqual(['Rockland Trust Employee', 'College / University', 'Mass Hire', 'Diversity Sites', 'Agency', 'Other',
      'LinkedIN', 'Indeed', 'Rockland Trust Careers Page']);
  }, 20000);

  it('pill lists of aria-pressed buttons are single-choice questions (live UL Solutions, 2026-10-13)', async () => {
    const pills = (id: string, q: string, opts: string[]) => `<div class="input-row input-row--has-picker">
      <label class="input-row__label input-row__label--required" for="${id}" aria-labelledby="labelText-${id}"><span id="labelText-${id}">${q}</span></label>
      <div class="input-row__control-container"><ul role="list" aria-label="${q}" class="cx-select-pills-container">${opts.map((o) =>
        `<li role="listitem"><button type="button" aria-disabled="false" aria-pressed="false" class="cx-select-pill-section "><span class="cx-select-pill-name"> ${o}</span></button></li>`).join('')}</ul></div></div>`;
    document.body.innerHTML = `<div class="apply-flow"><form>${pills('a', 'Are you legally authorized to work in the country to which you are applying?', ['Yes', 'No'])}
      ${pills('b', 'Please indicate the degree you are currently pursuing.', ["Associate's", "Bachelor's", "Master's"])}</form></div>`;
    document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      b.closest('ul')!.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    }));
    const f = oracle.extract(document);
    expect(f.map((x) => [x.label, x.kind, x.required, x.options])).toEqual([
      ['Are you legally authorized to work in the country to which you are applying?', 'radio', true, ['Yes', 'No']],
      ['Please indicate the degree you are currently pursuing.', 'radio', true, ["Associate's", "Bachelor's", "Master's"]],
    ]);
    expect(await oracle.fill(f[0]!, 'yes')).toBe('filled');
    expect([...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed')).slice(0, 2)).toEqual(['true', 'false']);
    expect(await oracle.fill(f[0]!, 'no')).toBe('skipped_nonempty');
  });

  it('diversity checkboxes: unnamed boxes in one labelled group are one question (live 2026-10-13)', () => {
    const item = (code: string, text: string) => `<div class="input-row__control-item"><input type="checkbox" class="input-row__hidden-control" value="${code}" id="dq-option-${code}" aria-labelledby="label-dq-option-${code}">
      <label class="apply-flow-input-checkbox" for="dq-option-${code}"><span class="apply-flow-input-checkbox__button"></span><span class="apply-flow-input-checkbox__label">${text}</span></label></div>`;
    const group = (id: string, label: string, items: string) => `<div class="input-row input-row--radiogroup" role="group" aria-labelledby="${id}-label">
      <label class="input-row__label" id="${id}-label"><span class="input-row__linebreak">${label}</span></label>
      <div class="input-row__control-container">${items}</div></div>`;
    document.body.innerHTML = `<div class="apply-flow"><form>
      ${group('hl', 'Ethnicity', item('4', 'I am Hispanic or Latino.'))}
      ${group('races', 'Select the races you identify with.', item('7', 'American Indian or Alaska Native') + item('5', 'Asian') + item('3', 'Black or African American')
        + item('NS', 'Choose Not to Specify') + item('6', 'Native Hawaiian or other Pacific Islander') + item('1', 'White'))}</form></div>`;
    expect(oracle.extract(document).map((x) => [x.label, x.kind, x.options])).toEqual([
      ['Ethnicity', 'checkbox', undefined],
      ['Select the races you identify with.', 'checkbox', ['American Indian or Alaska Native', 'Asian', 'Black or African American',
        'Choose Not to Specify', 'Native Hawaiian or other Pacific Islander', 'White']],
    ]);
  });
});
