import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractFields, toDescriptor } from '../../src/workday/extractFields';

const load = (name: string) => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/${name}`, 'utf8'); };

describe('extractFields', () => {
  it('my information page', () => {
    load('workday-my-info.html');
    const f = extractFields();
    expect(f.map(toDescriptor)).toEqual([
      { id: 'wf-0', label: 'First Name', kind: 'text', required: true, section: 'Legal Name' },
      { id: 'wf-1', label: 'Last Name', kind: 'text', required: true, section: 'Legal Name' },
      { id: 'wf-2', label: 'Country', kind: 'select', required: true },
      { id: 'wf-3', label: 'Phone Number', kind: 'text', required: false },
      { id: 'wf-4', label: 'Have you previously worked here?', kind: 'radio', required: true, options: ['Yes', 'No'] },
    ]);
    expect(f[0]!.container.dataset.wfId).toBe('wf-0');
  });
  it('certification section: keys come from the labels, the upload is the proof and not the resume', () => {
    document.body.innerHTML = `<h3 id="Certifications-section">Certifications</h3>
      <div role="group" aria-labelledby="Certifications-section">
        <div role="group"><h4>Certification 2</h4>
          <div data-automation-id="formField-a"><label>Name*</label><input type="text"></div>
          <div data-automation-id="formField-b"><label>Certification Number</label><input type="text"></div>
          <div data-automation-id="formField-c"><label>Date Issued</label><input data-automation-id="dateSectionYear-input"></div>
          <div data-automation-id="formField-d"><label>Date Expired</label><input data-automation-id="dateSectionYear-input"></div>
          <div data-automation-id="formField-e"><label>Upload proof</label><input type="file"></div>
          <div data-automation-id="formField-f"><label>Anything else</label><input type="text"></div>
        </div>
      </div>`;
    expect(extractFields().map((x) => [x.label, x.profileKey, x.groupIndex])).toEqual([
      ['Name', 'cert.name', 1],
      ['Certification Number', 'cert.number', 1],
      ['Date Issued', 'cert.issuedDate', 1],
      ['Date Expired', 'cert.expirationDate', 1],
      ['Upload proof', 'cert.proof', 1],
      ['Anything else', undefined, 1],
    ]);
  });
  it('my experience page: groups, kinds, indexes', () => {
    load('workday-my-experience.html');
    expect(extractFields().map((x) => [x.label, x.kind, x.section, x.groupIndex])).toEqual([
      ['Job Title', 'text', 'Work Experience 1', 0],
      ['I currently work here', 'checkbox', 'Work Experience 1', 0],
      ['From', 'date', 'Work Experience 1', 0],
      ['Role Description', 'textarea', 'Work Experience 1', 0],
      ['Job Title', 'text', 'Work Experience 2', 1],
      ['Resume/CV', 'file', undefined, 0],
    ]);
  });
  it('real Workday capture: Degree dropdown with hidden value input', () => {
    load('real-education-degree.html');
    expect(extractFields().map(toDescriptor)).toEqual([{ id: 'wf-0', label: 'Degree', kind: 'select', required: true }]);
  });
  it('finds the resume drop zone and an agreement box whatever box they sit in; another document is not the resume', () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="rs"><h3 id="rs">Resume/CV</h3>
        <div data-automation-id="formField-attachments"><div data-automation-id="file-upload-drop-zone"><button type="button">Select files</button><input type="file"></div></div></div>
      <div data-automation-id="formField-coverLetter"><label>Cover Letter</label><input type="file"></div>
      <div data-automation-id="formField-name"><label>Name*</label><input type="text"></div>
      <div><p>Terms</p><div><input type="checkbox" id="agree" aria-required="true"><label for="agree">Yes, I have read and consent to the terms and conditions</label></div></div>
      <div><div><div data-automation-id="file-upload-drop-zone"><input type="file" style="display:none"></div></div></div>`;
    expect(extractFields().map((f) => [f.label, f.kind, f.required, f.profileKey])).toEqual([
      ['Resume/CV', 'file', false, 'resumeFile'],
      ['Cover Letter', 'file', false, undefined],
      ['Name', 'text', true, undefined],
      ['Yes, I have read and consent to the terms and conditions', 'checkbox', true, undefined],
      ['Resume/CV', 'file', false, 'resumeFile'],
    ]);
    const stray = extractFields()[3]!.container;
    expect(stray.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(stray.textContent).toContain('Terms'); // the sentence the box agrees to comes with it
  });
  it('re-extraction reassigns stable ids', () => {
    load('workday-my-info.html');
    extractFields();
    expect(extractFields()[2]!.id).toBe('wf-2');
  });
  it('voluntary disclosures: keys come from automation ids, whose labels do not name the field (live 2026-10-12)', () => {
    const dd = (id: string, label: string) => `<div data-automation-id="formField-${id}"><label>${label}</label><button aria-haspopup="listbox" type="button">Select One</button></div>`;
    document.body.innerHTML = dd('gender', 'Please select which most accurately describes how you self-identify.*')
      + dd('hispanicOrLatino', 'Please indicate if you are Hispanic or Latino (Leave blank if you do not wish to answer).')
      + dd('ethnicity', 'Please select the ethnicity which most accurately describes how you identify yourself.*')
      + dd('veteranStatus', 'Please select the veteran status which most accurately describes your status.*')
      + dd('somethingElse', 'Other question');
    expect(extractFields().map((f) => f.profileKey)).toEqual(['gender', 'ethnicity', 'ethnicity', 'veteranStatus', undefined]);
    expect(toDescriptor(extractFields()[0]!)).not.toHaveProperty('profileKey');
  });
});

// Live SWIB Self Identify step (2026-11-17): Date and the three boxes were left empty and the step called complete.
describe('workday disability form', () => {
  const FORM = `
    <div data-automation-id="formField-name" data-fkit-id="selfIdentifiedDisabilityData--name"><label>Name*</label><input type="text"></div>
    <div data-automation-id="formField-dateSignedOn" data-fkit-id="selfIdentifiedDisabilityData--dateSignedOn"><fieldset><legend><label>Date*</label></legend>
      <input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionDay-input"><input data-automation-id="dateSectionYear-input"></fieldset></div>
    <div data-automation-id="formField-disabilityStatus" data-fkit-id="selfIdentifiedDisabilityData--disabilityStatus"><fieldset><legend><label>Please check one of the boxes below:*</label></legend>
      <input id="a-ds" type="checkbox"><label for="a-ds">Yes, I have a disability, or have had one in the past</label>
      <input id="b-ds" type="checkbox"><label for="b-ds">No, I do not have a disability and have not had one in the past</label>
      <input id="c-ds" type="checkbox"><label for="c-ds">I do not want to answer</label></fieldset></div>`;
  it('signs with the whole name, dates it today and reads the boxes as one choice', async () => {
    document.body.innerHTML = FORM;
    const [name, date, status] = extractFields(document);
    expect(name!.label).toBe('Signature (full name)');
    expect(date!.answer).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status).toMatchObject({ kind: 'checkbox', profileKey: 'disabilityStatus', required: true });
    expect(status!.options).toHaveLength(3);
    const { fillField } = await import('../../src/fill/fillField');
    // The day is picked in Workday's calendar: a typed one shows but is not kept.
    date!.container.insertAdjacentHTML('beforeend', '<button data-automation-id="dateIcon"></button>');
    let picked = false;
    date!.container.querySelector('[data-automation-id="dateIcon"]')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<div data-automation-id="datePicker"><button data-automation-id="datePickerSelectedToday">17</button></div>');
      document.querySelector('[data-automation-id="datePickerSelectedToday"]')!.addEventListener('click', () => { picked = true; });
    });
    expect(await fillField(date!, '2026-11-17')).toBe('filled');
    expect(picked).toBe(true);
    expect(await fillField(status!, 'decline')).toBe('filled');
    expect((status!.members![2] as HTMLInputElement).checked).toBe(true);
    expect(await fillField(status!, 'No')).toBe('skipped_nonempty');
  });
  it('picks No by its leading word', async () => {
    document.body.innerHTML = FORM;
    const status = extractFields(document)[2]!;
    const { fillField } = await import('../../src/fill/fillField');
    expect(await fillField(status, 'No')).toBe('filled');
    expect((status.members![1] as HTMLInputElement).checked).toBe(true);
  });
});
