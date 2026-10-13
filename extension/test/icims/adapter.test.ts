import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { icims } from '../../src/icims/adapter';

const EXPECTED_ICIMS_PROFILE: Array<[string, string]> = [
  ['Please upload your resume (Max size: 5 MB)', 'file'],
  ['Login', 'text'],
  ['First Name', 'text'],
  ['Middle Name', 'text'],
  ['Last Name', 'text'],
  ['Email', 'text'],
  ['Type', 'select'],
  ['Number', 'text'],
  ['Type', 'select'],
  ['Address', 'text'],
  ['Address 2', 'text'],
  ['City', 'text'],
  ['Zip/Postal Code', 'text'],
  ['Country', 'select'],
  ['State/Province', 'select'],
  ['County', 'text'],
  ['Please select your preferred area of interest', 'select'],
  ['Where did you find this job?', 'select'],
  ['Employee Referral? Enter name below', 'text'],
  ['Please share your annual salary expectations', 'text'],
];

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
  it('real capture: profile step', () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-icims-profile.html`, 'utf8');
    expect(icims.isFormPage(document)).toBe(true);
    expect(icims.extract(document).map((x) => [x.label, x.kind])).toEqual(EXPECTED_ICIMS_PROFILE);
  });
  it('real capture: uploads the resume, but not over one already on file', async () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-icims-profile.html`, 'utf8');
    expect(icims.resumeReloadsPage).toBe(true);
    const resume = icims.extract(document)[0]!;
    // The live onchange submits the form; jsdom can't, so keep it out of the way.
    document.getElementById('PortalProfileFields.Resume_File')!.removeAttribute('onchange');
    const file = new File(['x'], 'r.pdf');
    (document.getElementById('PortalProfileFields.Resume_FileName') as HTMLInputElement).value = 'resume.pdf';
    expect(await icims.fillFile(resume, file)).toBe('skipped_nonempty');
    (document.getElementById('PortalProfileFields.Resume_FileName') as HTMLInputElement).value = '';
    expect(await icims.fillFile(resume, file)).not.toBe('skipped_nonempty');
  });
  it('real capture: Country loads its list only when the widget opens, and is picked there', async () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-icims-profile.html`, 'utf8');
    const id = '-1_PersonProfileFields.AddressCountry';
    const sel = document.getElementById(id) as HTMLSelectElement;
    const ul = document.getElementById(`${id}_dropdown-results`)!;
    // As live: opening fills the list; a pick adds its option to the select.
    document.getElementById(`${id}_icimsDropdown`)!.addEventListener('click', () => {
      ul.innerHTML = ['— Make a Selection —', 'United States', 'United States Minor Outlying Islands', 'Canada']
        .map((t, i) => `<li class="dropdown-result result-selectable" dropdown-index="${i - 1}" title="${t}">${t}</li>`).join('');
    });
    ul.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li')!;
      sel.insertAdjacentHTML('beforeend', `<option value="v${li.getAttribute('dropdown-index')}">${li.title}</option>`);
      sel.value = `v${li.getAttribute('dropdown-index')}`;
    });
    const country = icims.extract(document).find((x) => x.label === 'Country')!;
    expect(await icims.fill(country, 'United States', 500)).toBe('filled');
    expect(sel.options[sel.selectedIndex]!.text).toBe('United States');
    expect(await icims.fill(country, 'Canada', 500)).toBe('skipped_nonempty');
  });
  it('real capture: State searches past the first page of its list', async () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-icims-profile.html`, 'utf8');
    const id = '-1_PersonProfileFields.AddressState';
    const sel = document.getElementById(id) as HTMLSelectElement;
    sel.innerHTML = '<option value=""></option>'; // Country is chosen
    const ul = document.getElementById(`${id}_dropdown-results`)!;
    const li = (t: string, i: number) => `<li class="dropdown-result result-selectable" dropdown-index="${i}" title="${t}">${t}</li>`;
    document.getElementById(`${id}_icimsDropdown`)!.addEventListener('click', () => { ul.innerHTML = ['Armed Forces', 'Alabama', 'Alaska'].map(li).join(''); });
    const search = document.querySelector<HTMLInputElement>(`[id="${id}_icimsDropdown_ctnr"] input.dropdown-search`)!;
    search.addEventListener('keyup', () => { ul.innerHTML = ['New Mexico', 'New York'].filter((t) => t.startsWith(search.value)).map(li).join(''); });
    ul.addEventListener('click', (e) => {
      const pick = (e.target as HTMLElement).closest('li')!;
      sel.insertAdjacentHTML('beforeend', `<option value="s">${pick.title}</option>`);
      sel.value = 's';
    });
    const state = icims.extract(document).find((x) => x.label === 'State/Province')!;
    expect(await icims.fill(state, 'NY', 500)).toBe('filled');
    expect(search.value).toBe('New York');
    expect(sel.options[sel.selectedIndex]!.text).toBe('New York');
  });
  describe('real capture: questions step', () => {
    const loadQuestions = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-icims-questions.html`, 'utf8'); };
    it('extracts the screening questions and fills a select once', async () => {
      loadQuestions();
      expect(icims.isFormPage(document)).toBe(true);
      const fields = icims.extract(document);
      expect(fields.map((f) => [f.label, f.kind, f.required])).toEqual([
        ['Are you authorized to work in the US?', 'select', true],
        ['Do you now or in the future require sponsorship? (e.g., H-1B visa status)', 'select', true],
        ['What are your salary expectations?', 'text', false],
        ['Please share with us how you heard about this job opportunity?', 'textarea', true],
      ]);
      expect(await icims.fill(fields[0]!, true)).toBe('filled');
      expect((document.getElementById('Q25') as HTMLSelectElement).value).toBe('Yes');
      expect(await icims.fill(fields[0]!, true)).toBe('skipped_nonempty');
    });
    it('matches the form explicitly, even with a password input', () => {
      loadQuestions();
      document.getElementById('questions')!.insertAdjacentHTML('beforeend', '<input type="password" name="pw">');
      expect(icims.extract(document)).toHaveLength(4);
    });
  });
});
