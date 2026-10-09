import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { icims } from '../../src/icims/adapter';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/icims-profile.synthetic.html`, 'utf8'); };

beforeEach(load);

describe('icims adapter', () => {
  it('detects iCIMS hosts only', () => {
    expect(icims.detect(new URL('https://careers-acme.icims.com/jobs/1234/engineer/candidate?in_iframe=1'))).toBe(true);
    expect(icims.detect(new URL('https://icims.com.evil.example/'))).toBe(false);
  });
  it('extracts the profile form, not the job search form', () => {
    expect(icims.extract(document).map((f) => [f.label, f.kind, f.required, f.section, f.groupIndex])).toEqual([
      ['First Name', 'text', true, 'Candidate Profile', 0],
      ['Email', 'text', true, 'Candidate Profile', 0],
      ['State', 'select', false, 'Candidate Profile', 0],
      ['Are you legally authorized to work in the United States?', 'radio', true, 'Candidate Profile', 0],
      ['School', 'text', false, 'Education', 0],
      ['School', 'text', false, 'Education', 1],
      ['Resume', 'file', false, 'Documents', 0],
    ]);
  });
  it('a job search form alone is not an application', () => {
    document.getElementById('cpForm')!.remove();
    expect(icims.isFormPage(document)).toBe(false);
    expect(icims.extract(document)).toEqual([]);
  });
  it('login and job-alert forms are not applications', () => {
    document.getElementById('cpForm')!.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <form id="f1" action="/candidate"><label for="le">Email</label><input id="le" type="email"><label for="lp">Password</label><input id="lp" type="password">
        <input type="checkbox" id="rm"><label for="rm">Remember me</label></form>
      <form class="jobAlertForm"><label for="ae">Email</label><input id="ae" type="email"><label for="ak">Keyword</label><input id="ak"></form>`);
    expect(icims.isFormPage(document)).toBe(false);
    expect(icims.extract(document)).toEqual([]);
  });
  it('form page and step key', () => {
    expect(icims.isFormPage(document)).toBe(true);
    expect(icims.stepKey(document)).toMatch(/\|Candidate Profile$/);
  });
  it('fills a native select', async () => {
    const state = icims.extract(document)[2]!;
    expect(await icims.fill(state, 'NY')).toBe('filled');
    expect((document.getElementById('PersonProfileFields.State') as HTMLSelectElement).value).toBe('NY');
  });
});
