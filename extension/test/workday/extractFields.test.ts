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
