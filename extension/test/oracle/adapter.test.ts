import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { oracle } from '../../src/oracle/adapter';

const CX = '/hcmUI/CandidateExperience/en/sites/CX_1/job/123';
const load = (path: string) => {
  history.pushState({}, '', path);
  document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/oracle-apply.synthetic.html`, 'utf8');
};

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
});
