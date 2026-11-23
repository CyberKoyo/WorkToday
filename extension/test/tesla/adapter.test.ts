// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tesla } from '../../src/tesla/adapter';
import { pickAdapter } from '../../src/ats/registry';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-tesla-apply.html`, 'utf8'); };

describe('tesla adapter (live apply form, step 1)', () => {
  it('is picked on the job page too, where the form opens in place', () => {
    expect(pickAdapter(new URL('https://www.tesla.com/careers/search/job/285179'))?.id).toBe('tesla');
    expect(pickAdapter(new URL('https://www.tesla.com/careers/search/job/apply/285179'))?.id).toBe('tesla');
    expect(pickAdapter(new URL('https://www.tesla.com/model3'))).toBeNull();
  });
  it('reads the personal information step', () => {
    load();
    expect(tesla.isFormPage(document)).toBe(true);
    expect(tesla.stepKey(document)).toBe('Step 1 of 4');
    const fields = tesla.extract(document);
    expect(fields.map((f) => [f.label, f.kind, f.required])).toEqual([
      ['Legal First Name', 'text', true], ['Legal Last Name', 'text', true], ['Middle Name', 'text', false],
      ['Preferred Name', 'text', false], ['Phone Number', 'text', true], ['Contact Phone Type', 'select', true],
      ['Email', 'text', true], ['Country/Region of Residence', 'select', true], ['Resume', 'file', true],
    ]);
    expect(fields.at(-1)!.profileKey).toBe('resumeFile');
  });
  it('fills a text box and a list', async () => {
    load();
    const fields = tesla.extract(document);
    expect(await tesla.fill(fields[0]!, 'Ada')).toBe('filled');
    expect(fields[0]!.container.querySelector('input')!.value).toBe('Ada');
    expect(await tesla.fill(fields[7]!, 'Albania')).toBe('filled');
    expect(fields[7]!.container.querySelector('select')!.value).toBe('AL');
  });
});
