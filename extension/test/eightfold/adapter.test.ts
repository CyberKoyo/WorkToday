// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { eightfold } from '../../src/eightfold/adapter';
import { fillFileGeneric } from '../../src/generic/fill';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-eightfold-apply.html`, 'utf8'); };

describe('eightfold adapter (live ST Microelectronics apply form)', () => {
  it('reads the resume box, contact fields and questions', () => {
    load();
    expect(eightfold.isFormPage(document)).toBe(true);
    const fields = eightfold.extract(document);
    expect(fields.map((f) => [f.label, f.kind])).toEqual([
      ['Resume', 'file'], ['Email', 'text'], ['First name', 'text'], ['Last name', 'text'],
      ['Country code', 'select'], ['Phone Number', 'text'], ['Country', 'select'], ['City (mandatory)', 'text'],
      ['Country of Residence', 'select'], ['Nationality', 'select'], ['Other Nationality', 'select'],
      ['Do you have any relatives working at STMicroelectronics?', 'radio'],
    ]);
    expect(fields[0]!.profileKey).toBe('resumeFile');
    expect(fields.at(-1)!.options).toEqual(['Yes', 'No']);
    expect(fields.at(-1)!.required).toBe(true);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
  });
  it('blurs a text box again once the site has taken the value (live: stale "cannot be left blank")', async () => {
    load();
    const email = eightfold.extract(document).find((f) => f.label === 'Email')!;
    const input = email.container.querySelector('input')!;
    let blurs = 0;
    input.addEventListener('focusout', () => { blurs++; });
    expect(await eightfold.fill(email, 'a@b.co')).toBe('filled');
    expect(input.value).toBe('a@b.co');
    expect(blurs).toBe(2);
  });
  it('attaches the resume to the hidden dropzone input', async () => {
    load();
    const [resume] = eightfold.extract(document);
    const set: File[] = [];
    expect(await fillFileGeneric(resume!, new File(['x'], 'r.pdf'), (_i, f) => set.push(f))).toBe('filled');
    expect(set.map((f) => f.name)).toEqual(['r.pdf']);
  });
});
