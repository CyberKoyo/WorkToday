// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { phenom } from '../../src/phenom/adapter';
import { fillFileGeneric } from '../../src/generic/fill';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-phenom-info.html`, 'utf8'); };

describe('phenom adapter (live STERIS "My Information" step)', () => {
  it('reads the resume upload and the profile fields', () => {
    load();
    expect(phenom.isFormPage(document)).toBe(true);
    const fields = phenom.extract(document);
    expect(fields[0]).toMatchObject({ label: 'Resume', kind: 'file', profileKey: 'resumeFile' });
    expect(fields.slice(1, 15).map((f) => [f.label, f.kind])).toEqual([
      ['First Name', 'text'], ['Middle Name', 'text'], ['Last Name', 'text'], ['Phone Number:', 'text'], ['Email', 'text'],
      ['Suffix', 'text'], ['Preferred Name', 'text'], ['Home Address', 'text'], ['Apartment Number', 'text'],
      ['Country', 'select'], ['State/Province', 'select'], ['City', 'text'], ['Zip/Postal Code', 'text'], ['Home Phone Number', 'text'],
    ]);
    expect(fields.filter((f) => f.kind === 'checkbox' && f.required)).toHaveLength(2); // terms + privacy acknowledgements
  });
  it('attaches the resume to the hidden input beside "Upload Resume"', async () => {
    load();
    const set: string[] = [];
    expect(await fillFileGeneric(phenom.extract(document)[0]!, new File(['x'], 'r.pdf'), (_i, f) => set.push(f.name))).toBe('filled');
    expect(set).toEqual(['r.pdf']);
  });
});
