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
  it('re-extraction reassigns stable ids', () => {
    load('workday-my-info.html');
    extractFields();
    expect(extractFields()[2]!.id).toBe('wf-2');
  });
});
