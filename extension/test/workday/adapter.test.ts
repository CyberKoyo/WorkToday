import { describe, it, expect } from 'vitest';
import { workday } from '../../src/workday/adapter';

describe('workday adapter', () => {
  it('detects Workday hosts only', () => {
    expect(workday.detect(new URL('https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x/apply'))).toBe(true);
    expect(workday.detect(new URL('https://wd3.myworkday.com/acme/d/task/1.htmld'))).toBe(true);
    expect(workday.detect(new URL('https://myworkdayjobs.com.evil.example/'))).toBe(false);
    expect(workday.detect(new URL('https://job-boards.greenhouse.io/x'))).toBe(false);
  });
  it('form page and step key', () => {
    document.body.innerHTML = '<h2 data-automation-id="pageHeader">My Information</h2>';
    expect(workday.isFormPage(document)).toBe(false);
    document.body.insertAdjacentHTML('beforeend', '<div data-automation-id="formField-a"><label>A</label><input></div>');
    expect(workday.isFormPage(document)).toBe(true);
    expect(workday.stepKey(document)).toMatch(/\|My Information$/);
  });
  it('extracts with the Workday extractor', () => {
    document.body.innerHTML = '<div data-automation-id="formField-a"><label>First Name*</label><input type="text"></div>';
    expect(workday.extract(document).map((f) => [f.id, f.label, f.kind, f.required])).toEqual([['wf-0', 'First Name', 'text', true]]);
  });
});
