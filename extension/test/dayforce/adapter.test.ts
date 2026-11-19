// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dayforce } from '../../src/dayforce/adapter';
import { pickAdapter } from '../../src/ats/registry';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-dayforce-apply.html`, 'utf8'); };

describe('dayforce adapter (live guest application, Candidate Info step)', () => {
  it('is picked on jobs.dayforcehcm.com', () => {
    expect(pickAdapter(new URL('https://jobs.dayforcehcm.com/en-US/acme/CANDIDATEPORTAL/jobs/1/apply/manualApplication'))?.id).toBe('dayforce');
  });
  it('reads the resume box, the Ant selects and both history sections', () => {
    load();
    expect(dayforce.isFormPage(document)).toBe(true);
    expect(dayforce.stepKey(document)).toMatch(/\|Candidate Info$/);
    const fields = dayforce.extract(document);
    const row = (label: string, section?: string) => fields.find((f) => f.label === label && (!section || f.section === section))!;
    expect(fields[0]).toMatchObject({ label: 'Resume', kind: 'file', profileKey: 'resumeFile' });
    expect(row('Email Address')).toMatchObject({ kind: 'text', required: true });
    expect(row('Country', 'Personal Information')).toMatchObject({ kind: 'select', required: true });
    expect(row('How did you hear about this job?').kind).toBe('select');
    expect(row('School')).toMatchObject({ kind: 'text', section: 'Education History' });
    expect(row('End Date', 'Education History')).toMatchObject({ kind: 'date', required: true });
    expect(row('Not Completed').kind).toBe('checkbox');
    expect(row('Employer Name')).toMatchObject({ section: 'Employment History', required: true });
    expect(row('Duties and Responsibilities').kind).toBe('textarea');
    // Disabled until Country is chosen.
    expect(fields.some((f) => f.label === 'State/Province')).toBe(false);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
  });
  it('attaches the resume once and waits for the import to land', async () => {
    load();
    const [resume] = dayforce.extract(document);
    const input = resume!.container.querySelector('input')!;
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [] });
    input.addEventListener('change', () => setTimeout(() => {
      document.querySelector('main')!.insertAdjacentHTML('beforeend', '<div test-id="upload-file-item-test">r.pdf</div>');
    }, 200));
    expect(await dayforce.fillFile(resume!, new File(['x'], 'r.pdf'))).toBe('filled');
    expect(document.querySelector('[test-id="upload-file-item-test"]')).not.toBeNull();
    expect(await dayforce.fillFile(resume!, new File(['x'], 'r.pdf'))).toBe('skipped_nonempty');
  }, 20000);
  it('leaves a select that already shows a choice', async () => {
    load();
    const country = dayforce.extract(document).find((f) => f.label === 'Country')!;
    country.container.querySelector('.ant-select-selector')!.insertAdjacentHTML('beforeend', '<span class="ant-select-selection-item">Canada</span>');
    expect(await dayforce.fill(country, 'United States of America')).toBe('skipped_nonempty');
  });
});
