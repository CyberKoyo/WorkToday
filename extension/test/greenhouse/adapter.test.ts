import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { greenhouse } from '../../src/greenhouse/adapter';
import { toDescriptor } from '../../src/ats/field';
import { emptyProfile, emptyEdu } from '../../src/profile/profile';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/greenhouse-application.html`, 'utf8'); };

beforeEach(load);

const EXPECTED_GREENHOUSE_EDUCATION: Array<[string, string]> = [
  ['First Name', 'text'],
  ['Last Name', 'text'],
  ['Preferred First Name', 'text'],
  ['Email', 'text'],
  ['Country', 'select'],
  ['Phone', 'text'],
  ['Location (City)', 'select'],
  ['Resume/CV', 'file'],
  ['Cover Letter', 'file'],
  ['School', 'select'],
  ['Degree', 'select'],
  ['Discipline', 'select'],
  ['Start date year', 'text'],
  ['End date year', 'text'],
  ['Are you legally authorized to work in the United States?', 'select'],
  ['Will you now or in the future require an employment visa to work in the US?', 'select'],
  ['This is not a self-paced training program. Are you able to work 25-29 hrs/wk with a majority of hours being between 11am-4pm eastern Monday - Friday?', 'select'],
  ['When are you available for full-time hire?', 'select'],
  ['Do you have any formal training or experience within cybersecurity/IT? (select all that apply)', 'select'],
  ['Do you have a recognized industry certification?', 'select'],
  ['If yes, please list all recognized industry certifications', 'text'],
  ['Did you hear about GPSU from any of the below organizations?', 'select'],
  ['Are you a current or former GPS employee?', 'select'],
  ['Are you a GuidePoint Security Employee Referral?', 'select'],
  ['If you answered Yes above, list the name of the GuidePoint Security Employee that referred you and a brief note regarding your connection to them', 'text'],
  ['Are you related to or associated with a Customer or Vendor Partner of GuidePoint Security?', 'select'],
  ['If you answered Yes above, please list the contact name and organization', 'text'],
  ['Will you be physically located within the United States during the entire duration of the internship?', 'select'],
  ['Where will you primarily be located during the internship?', 'select'],
  ['Full Street Address', 'text'],
  ['City, State & Zip', 'text'],
  ['LinkedIn Profile URL', 'text'],
  ['Additional Comments', 'textarea'],
  ['Gender', 'select'],
  ['Are you Hispanic/Latino?', 'select'],
  ['Veteran Status', 'select'],
];

describe('greenhouse adapter', () => {
  it('detects Greenhouse hosts only', () => {
    expect(greenhouse.detect(new URL('https://job-boards.greenhouse.io/acme/jobs/1'))).toBe(true);
    expect(greenhouse.detect(new URL('https://boards.greenhouse.io/acme/jobs/1'))).toBe(true);
    expect(greenhouse.detect(new URL('https://job-boards.eu.greenhouse.io/embed/job_app?for=acme&token=1'))).toBe(true);
    expect(greenhouse.detect(new URL('https://greenhouse.io.evil.example/'))).toBe(false);
  });
  it('form page only when the application form is present', () => {
    expect(greenhouse.isFormPage(document)).toBe(true);
    document.body.innerHTML = '<h1>Jobs</h1><input id="keyword-filter" type="text">';
    expect(greenhouse.isFormPage(document)).toBe(false);
  });
  it('extracts the real form', () => {
    expect(greenhouse.extract(document).map(toDescriptor)).toEqual([
      { id: 'wf-0', label: 'First Name', kind: 'text', required: true },
      { id: 'wf-1', label: 'Email', kind: 'text', required: true },
      { id: 'wf-2', label: 'Country', kind: 'select', required: true, section: 'Phone' },
      { id: 'wf-3', label: 'Phone', kind: 'text', required: true, section: 'Phone' },
      { id: 'wf-4', label: 'Resume/CV', kind: 'file', required: true },
      { id: 'wf-5', label: 'LinkedIn Profile', kind: 'text', required: false },
      { id: 'wf-6', label: 'Why do you want to join us?', kind: 'textarea', required: true },
      { id: 'wf-7', label: 'Are you authorized to work in the country for which you applied?', kind: 'select', required: true },
      { id: 'wf-8', label: 'Which countries could you work in?', kind: 'checkbox', required: true, options: ['Australia', 'Canada'] },
      { id: 'wf-9', label: 'School', kind: 'select', required: true, section: 'Education 1' },
      { id: 'wf-10', label: 'Degree', kind: 'select', required: true, section: 'Education 1' },
      { id: 'wf-11', label: 'Gender', kind: 'select', required: false, section: 'Voluntary Self-Identification' },
    ]);
  });
  it('fills a text field', async () => {
    const [first] = greenhouse.extract(document);
    expect(await greenhouse.fill(first!, 'Ada')).toBe('filled');
    expect((document.getElementById('first_name') as HTMLInputElement).value).toBe('Ada');
  });
  it('adds education groups and numbers them', async () => {
    const box = document.querySelector('.education--container')!;
    box.querySelector('.add-another-button')!.addEventListener('click', () => {
      const n = box.querySelectorAll('.education--form').length;
      const clone = box.querySelector('.education--form')!.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[id]').forEach((e) => { e.id = e.id.replace('--0', `--${n}`); });
      clone.querySelectorAll('[for],[aria-labelledby]').forEach((e) => {
        for (const a of ['for', 'aria-labelledby']) if (e.hasAttribute(a)) e.setAttribute(a, e.getAttribute(a)!.replace('--0', `--${n}`));
      });
      box.querySelector('.add-another-button')!.before(clone);
    });
    const p = emptyProfile();
    p.education = [emptyEdu(), emptyEdu()];
    await greenhouse.ensureGroups(document, p);
    const schools = greenhouse.extract(document).filter((f) => f.label === 'School');
    expect(schools.map((f) => [f.section, f.groupIndex])).toEqual([['Education 1', 0], ['Education 2', 1]]);
  });
  it('real capture: application form with education', () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-greenhouse-education.html`, 'utf8');
    expect(greenhouse.isFormPage(document)).toBe(true);
    const f = greenhouse.extract(document);
    expect(f.map((x) => [x.label, x.kind])).toEqual(EXPECTED_GREENHOUSE_EDUCATION);
    expect(f.filter((x) => x.section === 'Education 1').map((x) => x.label)).toEqual(['School', 'Degree', 'Discipline', 'Start date year', 'End date year']);
  });
});
