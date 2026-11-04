import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { adp, attachDocument } from '../../src/adp/adapter';

const load = (c: string) => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-adp-${c}.html`, 'utf8'); };
const field = (label: string) => adp.extract(document).find((f) => f.label === label)!;

// A dijit Select's menu as the live page renders it on mousedown (rows from a live Country/State popup).
function fakeMenu(t: HTMLElement, options: string[]) {
  t.addEventListener('mousedown', () => {
    if (document.getElementById(`${t.id}_menu`)) return;
    const rows = ['— Please Specify —', ...options].map((o) => `<tr role="option"><td class="dijitMenuItemLabel"><span>${o}</span></td><td><span class="dijitMenuExpandA11y">+</span></td></tr>`);
    document.body.insertAdjacentHTML('beforeend', `<div class="dijitPopup"><table id="${t.id}_menu" role="listbox"><tbody>${rows.join('')}</tbody></table></div>`);
    document.querySelectorAll<HTMLElement>(`[id="${t.id}_menu"] tr`).forEach((r) => r.addEventListener('click', () => {
      t.querySelector('.dijitSelectLabel')!.innerHTML = `\u200b<span class="label">${r.textContent!.replace('+', '').trim()}&nbsp;</span>`;
    }));
  });
}

describe('adp adapter', () => {
  it('detects ADP Recruiting Management hosts only', () => {
    expect(adp.detect(new URL('https://recruiting.adp.com/srccar/public/nghome.guid?ncsp=confidentialwwt&r=5001234342900'))).toBe(true);
    expect(adp.detect(new URL('https://recruiting2.adp.com/srccar/public/RTI.home?c=1'))).toBe(true);
    expect(adp.detect(new URL('https://recruiting.adp.com.evil.example/'))).toBe(false);
    expect(adp.detect(new URL('https://myjobs.adp.com/confidentialwwt/auth'))).toBe(false);
  });
  it('form page only when an application step is loaded', () => {
    load('contact');
    expect(adp.isFormPage(document)).toBe(true);
    expect(adp.stepKey(document)).toBe('contactComponentForm|1. Contact Information|');
    document.body.innerHTML = '<form><div class="element"><label>Language</label></div></form>';
    expect(adp.isFormPage(document)).toBe(false);
  });
  it('extracts the live contact step by its labels, not the language picker', () => {
    load('contact');
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required])).toEqual([
      ['Email Address', 'text', true],
      ['First Name', 'text', true],
      ['Preferred First Name', 'text', false],
      ['Middle Name', 'text', false],
      ['Last Name', 'text', true],
      ['Phone', 'text', true],
      ['SMS Messages', 'checkbox', false],
      ['Alternate Phone', 'text', false],
      ['Opt Out of Artificial Intelligence', 'checkbox', false],
      ['Address 1', 'text', false],
      ['Address 2', 'text', false],
      ['City', 'text', false],
      ['Country', 'select', false],
      ['State', 'select', false],
      ['County', 'select', false],
      ['ZIP Code:', 'text', true],
    ]);
  });
  it('fills the real text box, not the validation icon beside it', async () => {
    load('contact');
    const f = field('First Name');
    expect(await adp.fill(f, 'Jane')).toBe('filled');
    expect(document.querySelector<HTMLInputElement>('input[name="firstName"]')!.value).toBe('Jane');
    expect(await adp.fill(f, 'Other')).toBe('skipped_nonempty');
  });
  it('picks a state from the dijit menu, matching the abbreviation', async () => {
    load('contact');
    const f = field('State');
    fakeMenu(f.container, ['Tennessee', 'Texas', 'Utah']);
    expect(await adp.fill(f, 'TX', 500)).toBe('filled');
    expect(f.container.querySelector('.dijitSelectLabel')!.textContent).toContain('Texas');
  });
  it('extracts the live EEO step: each radio group asked by its own text, else its section heading', () => {
    load('eeo');
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required, f.options])).toEqual([
      ['Are you Hispanic or Latino?', 'radio', true, ['Yes', 'No', 'Decline To Identify']],
      ["If you answered 'no', please select one of the following categories that best describes your race:", 'radio', true,
        ['White', 'Black or African American', 'Asian', 'Native Hawaiian or Other Pacific Islander', 'American Indian or Alaska Native', 'Two or More Races', 'Decline to identify']],
      ['Voluntary Self-Identification of Gender', 'radio', true, ['Male', 'Female', 'Other', 'Decline to identify']],
      ['Voluntary Self-Identify As A Protected Veteran', 'radio', true, ['I AM A PROTECTED VETERAN', 'I AM NOT A PROTECTED VETERAN', 'I CHOOSE NOT TO SELF IDENTIFY']],
      ['Voluntary Self-Identification of Disability', 'radio', true,
        ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer']],
    ]);
  });
  it('ticks the matching EEO radio, and only in its own group', async () => {
    load('eeo');
    expect(await adp.fill(field('Voluntary Self-Identification of Gender'), 'Female')).toBe('filled');
    expect(document.querySelector<HTMLInputElement>('#eeoGender_00002000')!.checked).toBe(true);
    expect(await adp.fill(field('Are you Hispanic or Latino?'), 'No')).toBe('filled');
    expect(document.querySelector<HTMLInputElement>('#_latinoNo')!.checked).toBe(true);
    expect([...document.querySelectorAll<HTMLInputElement>('input[name="eeoEthnicity"]')].some((r) => r.checked)).toBe(false);
  });
  it('electronic signature step: the required consent box, ticked as the applicant asked', () => {
    load('esign');
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required, f.answer])).toEqual([['Reviewed', 'checkbox', true, true]]);
  });
  it('source step: the list takes the referral source; the parked follow-up boxes are left out', () => {
    load('source');
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required, f.profileKey])).toEqual([['Candidate Source', 'select', true, 'referralSource']]);
  });
  it('documents step: a file field per box, the resume known as the resume', () => {
    load('documents');
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required, f.profileKey])).toEqual([
      ['Resume', 'file', true, 'resumeFile'],
      ['Cover Letter', 'file', false, undefined],
    ]);
  });
  it('attaches the resume once the box shows its check, and leaves an attached one alone', async () => {
    load('documents');
    const f = field('Resume');
    const file = new File(['x'], 'resume.pdf');
    // The live page uploads on change and then swaps the ban icon for a check.
    const setFiles = vi.fn((input: HTMLInputElement) => input.addEventListener('change', () => {
      f.container.querySelector('.docBoxUnChecked')!.className = 'fa fa-check docBoxChecked';
    }));
    expect(await attachDocument(f, file, 500, setFiles)).toBe('filled');
    expect(setFiles).toHaveBeenCalledWith(f.container.querySelector('input[type="file"]'), file);
    expect(await attachDocument(f, file, 500, setFiles)).toBe('skipped_nonempty');
  });
  it('a resume the site never confirms is an error', async () => {
    load('documents');
    expect(await attachDocument(field('Resume'), new File(['x'], 'r.pdf'), 200, () => {})).toBe('error');
  });
  it('screening step: every question by its own text, asked only once its row shows', () => {
    load('questions');
    const fields = adp.extract(document);
    expect(fields.map((f) => [f.label, f.kind, f.required, f.options?.length])).toEqual([
      ['Are you at least 18 years of age?', 'radio', true, 2],
      ['Have you ever been employed by as an intern?', 'radio', true, 2],
      ['As a returning intern, would you like to rejoin your previous team or explore a new opportunity?', 'textarea', true, undefined],
      ['What is your highest level of completed education?', 'radio', true, 8],
      ['When do you plan to graduate college?', 'radio', true, 8],
      ['Are you currently a registered student athlete at your College/University?', 'radio', true, 2],
      ['Would you be interested in our Part Time (20 hour) internship program for Student Athletes?', 'radio', true, 2],
      ['Are you a current/previous participant in any one of our programs?', 'select', true, 14],
      ['If you answered "Other" to the previous question, please provide the name of the program(s) you participated in.', 'textarea', true, undefined],
      ['Please list your area of study (major/minor/certificate/trade).', 'textarea', true, undefined],
      ['Please list three other departments you would be interested in:', 'textarea', true, undefined],
      ['Please list your area of study.', 'textarea', true, undefined],
      ['I certify that all information I have provided to in support of my application for employment is true and accurate.', 'radio', false, 2],
    ]);
    expect(fields.map((f) => f.asked!())).toEqual([true, ...Array(12).fill(false)]);
    // Live: answering the first question shows the second (2026-10-27).
    document.getElementById('question_row_6373207')!.style.display = 'block';
    expect(fields[1]!.asked!()).toBe(true);
  });
  it('application form step: the Personal Information section, wrapped questions read whole', () => {
    load('appform');
    expect(adp.stepKey(document)).toMatch(/\|9\. Application Form\|Personal Information$/);
    expect(adp.extract(document).map((f) => [f.label, f.kind, f.required])).toEqual([
      ['Legal First Name', 'text', true],
      ['Legal Last Name', 'text', true],
      ['Legal Middle Name', 'text', false],
      ['Address 1', 'text', true],
      ['Address 2', 'text', false],
      ['City', 'text', true],
      ['Country', 'select', true],
      ['State/Province', 'select', false],
      ['Zip/Postal Code', 'text', false],
      ['Primary Phone', 'text', true],
      ['Secondary Phone', 'text', false],
      ['TRS Phone Number (This service allows individuals with hearing or speech disabilities to communicate over the phone)', 'text', false],
      ['Willing to Relocate', 'select', false],
      ['Willingness to Travel', 'select', true],
      ['Are you at least 18 years of age?', 'select', true],
      ['Are you presently authorized to work for any employer in the United States?', 'select', true],
      ['Do you currently, or will you in the future, need WWT to support you with US immigration sponsorship so that you retain work authorization in the United States?', 'select', true],
      ['Have you ever been employed by World Wide Technology?', 'select', true],
      ['If yes, what location?', 'text', false],
      ['From Date', 'text', false],
      ['To Date', 'text', false],
      ['Desired Salary', 'text', true],
      ['Are you able to perform the functions of the job which you are applying to with or without reasonable accommodation?', 'select', true],
      ['Regular attendance is an essential job function and is required of all WWT employees. Will you be able to meet this job requirement?', 'select', true],
      ['Do you have a non-compete and/or a non-solicit agreement from a previous employer?', 'select', true],
    ]);
  });
  it('next is the pager arrow, never on the last step', () => {
    load('contact');
    const rects = vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.closest('[style*="display: none"]') ? [] : [{}]) as unknown as DOMRectList;
    });
    expect(adp.nextButton!(document)?.dataset.dojoAttachPoint).toBe('thePagerSingleGo');
    const steps = document.querySelectorAll('.srccarSteps .step');
    steps[0]!.classList.remove('active');
    steps[steps.length - 1]!.classList.add('active');
    expect(adp.nextButton!(document)).toBeNull();
    rects.mockRestore();
  });
  it('leaves a chosen select alone and reports a missing option', async () => {
    load('contact');
    expect(await adp.fill(field('Country'), 'Canada', 500)).toBe('skipped_nonempty');
    const county = field('County');
    fakeMenu(county.container, ['Travis', 'Williamson']);
    expect(await adp.fill(county, 'Cook', 500)).toBe('no_match');
  });
});
