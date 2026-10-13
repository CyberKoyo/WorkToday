import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { successfactors, attachResume } from '../../src/successfactors/adapter';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-successfactors-apply.html`, 'utf8'); };

beforeEach(load);

// SF paginated picklist (live 2026-10-13): clicking the input renders <ul id="NN:_listSelect" role="listbox"> of
// role="option" items a page at a time; keyup re-renders it filtered by the typed text; a click on an item sets the
// input's text and the hidden form input after the widget.
function fakePicklist(row: HTMLElement, options: string[], pageSize = 100) {
  const input = row.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const hidden = row.querySelector<HTMLInputElement>('input[type="hidden"][id^="tor__f"]')!;
  const listId = input.getAttribute('aria-owns')!;
  const render = (list: string[]) => {
    document.getElementById(listId)?.remove();
    const ul = document.createElement('ul');
    ul.id = listId; ul.setAttribute('role', 'listbox');
    list.slice(0, pageSize).forEach((o, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = `${listId}_${i}`; li.textContent = o;
      li.addEventListener('click', () => { input.value = o; hidden.value = String(i); ul.remove(); });
      ul.append(li);
    });
    document.body.append(ul);
  };
  input.addEventListener('click', () => render(options));
  input.addEventListener('keyup', () => render(options.filter((o) => o.toLowerCase().includes(input.value.toLowerCase()))));
  return { input, hidden };
}

const field = (label: string) => successfactors.extract(document).find((f) => f.label === label)!;

describe('successfactors adapter', () => {
  it('detects SuccessFactors career site hosts only', () => {
    expect(successfactors.detect(new URL('https://career2.successfactors.eu/career?company=Ericsson&career_ns=job_application&career_job_req_id=792213'))).toBe(true);
    expect(successfactors.detect(new URL('https://career4.successfactors.com/career?company=acme'))).toBe(true);
    expect(successfactors.detect(new URL('https://career41.sapsf.com/career?company=acme'))).toBe(true);
    expect(successfactors.detect(new URL('https://performancemanager4.successfactors.com/sf/home'))).toBe(false);
    expect(successfactors.detect(new URL('https://career2.successfactors.eu.evil.example/career'))).toBe(false);
  });
  it('form page only when the application form is present', () => {
    expect(successfactors.isFormPage(document)).toBe(true);
    document.body.innerHTML = '<form id="careerform"><input type="text" id="keywordSearch" aria-label="Search jobs"></form>';
    expect(successfactors.isFormPage(document)).toBe(false);
  });
  it('extracts the live application form', () => {
    expect(successfactors.extract(document).map((f) => [f.label, f.kind, f.required])).toEqual([
      ['Email Address:', 'text', true],
      ['Retype Email Address:', 'text', true],
      ['First Name:', 'text', true],
      ['Middle Name:', 'text', false],
      ['Last Name:', 'text', true],
      ['Country/Region Code:', 'select', true],
      ['Phone Number:', 'text', true],
      ['Preferred Name:', 'text', false],
      ['Alternate Phone:', 'text', false],
      ['City:', 'text', true],
      ['State/Province', 'select', false],
      ['Postal Code', 'text', true],
      ['Citizenship 1:', 'select', true],
      ['Citizenship 2:', 'select', false],
      ['How did you hear about this position?', 'select', false],
      ['Please state your gender:', 'select', true],
      ['Race/Ethnicity', 'select', true],
      ['Protected Veteran', 'select', true],
      ['Do you have a potential Conflict of Interest as described above? (Yes or No)', 'select', true],
      ['Have you previously been employed by Ericsson, including as an intern, or any of it is subsidiaries/ affiliates?]', 'select', true],
      ['Have you ever provided services to Ericsson or any of it is subsidiaries/ affiliates as a contingent worker or a contractor on behalf of a staffing company or other service provider?', 'select', true],
      ['Do you have a non-compete clause, confidentiality obligations, or other contractual obligations to current or former employers that could impact your ability to work in the position for which you have applied?', 'select', true],
      ['Are you currently eligible to work in the United States?', 'select', true],
      ['Do you now, or will you in the future, require sponsorship to work in the USA?', 'select', true],
      ['Will you now or in the future require sponsorship for employment visa status (e.g. H-1B, O-1, L-1, TN, F-1, or EAD)?', 'radio', true],
      ['Do you currently have a cumulative GPA of 2.7 or greater based on a 4.0 scale (or equivalent)?', 'radio', true],
      ['Will you be actively enrolled in an accredited Undergraduate, Master’s, or PhD program for the duration of the co-op/internship offered?', 'radio', true],
      ['We’re curious about how you stay inspired and learn - tell us about something interesting you’ve discovered or learned recently. Feel free to share in just a few sentences.', 'textarea', true],
      ['Country/Region of Residence:', 'select', true],
      ['Notification:', 'checkbox', false],
      ['Hear more about career opportunities', 'checkbox', false],
      ['Resume / CV:', 'file', true],
    ]);
  });
  it('never offers the password boxes', () => {
    expect(document.querySelectorAll('#careerform input[type="password"]').length).toBe(2);
    expect(successfactors.extract(document).some((f) => /password/i.test(f.label))).toBe(false);
  });
  it('picks a picklist option and leaves a chosen one alone', async () => {
    const f = field('Protected Veteran');
    const { input, hidden } = fakePicklist(f.container.closest('tr')!, ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', 'I choose not to self-identify']);
    expect(await successfactors.fill(f, 'I am not a protected veteran', 500)).toBe('filled');
    expect(input.value).toBe('I am not a protected veteran');
    expect(hidden.value).toBe('0');
    expect(await successfactors.fill(f, 'I choose not to self-identify', 500)).toBe('skipped_nonempty');
  });
  it('types to find an option beyond the first page', async () => {
    const f = field('Citizenship 1:');
    const countries = [...Array.from({ length: 150 }, (_, i) => `Country ${i}`), 'United States'];
    const { input } = fakePicklist(f.container.closest('tr')!, countries, 100);
    expect(await successfactors.fill(f, 'United States', 300)).toBe('filled');
    expect(input.value).toBe('United States');
  });
  it('answers a yes/no picklist from a boolean', async () => {
    const f = field('Are you currently eligible to work in the United States?');
    const { input } = fakePicklist(f.container.closest('tr')!, ['Yes', 'No']);
    expect(await successfactors.fill(f, true, 500)).toBe('filled');
    expect(input.value).toBe('Yes');
  });
  it('searches a long state list by the full name of a US state code', async () => {
    const f = field('State/Province');
    const states = [...Array.from({ length: 150 }, (_, i) => `Province ${i}`), 'New York', 'Newfoundland'];
    const { input } = fakePicklist(f.container.closest('tr')!, states, 100);
    expect(await successfactors.fill(f, 'NY', 300)).toBe('filled');
    expect(input.value).toBe('New York');
  });

  it('offers the resume slot as the resume, never the cover letter', () => {
    const files = successfactors.extract(document).filter((f) => f.kind === 'file');
    expect(files.map((f) => [f.label, f.profileKey])).toEqual([['Resume / CV:', 'resumeFile']]);
  });
});

// SF attachment slot (live 2026-10-13): the "+" icon opens a callout dialog with one file input ("Upload from Device")
// and no upload button; choosing a file uploads it and marks the slot successBtn with a pencil icon.
function emptyResumeSlot() {
  const slot = [...document.querySelectorAll<HTMLElement>('.attachmentField')].find((e) => /resume/i.test(e.textContent ?? ''))!;
  slot.querySelector('.attachmentBtn')!.classList.remove('successBtn');
  const icon = slot.querySelector<HTMLElement>('.addAttachments')!;
  icon.className = 'glyphicon glyphicon-plus-sign addAttachments';
  icon.addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', `<div role="dialog" id="173:wrapper" aria-label="Select a source for your file upload">
      <span id="104:_uploadComputer">Upload from Device</span><input type="file" id="104:_file" class="fileUpload" name="fileData1"></div>`);
    document.getElementById('104:_file')!.addEventListener('change', () => {
      document.getElementById('173:wrapper')!.remove();
      slot.querySelector('.attachmentBtn')!.classList.add('successBtn');
      icon.className = 'glyphicon glyphicon-pencil addAttachments';
    });
  });
  return slot;
}

describe('successfactors resume upload', () => {
  const resume = new File(['%PDF'], 'resume.pdf', { type: 'application/pdf' });
  const resumeField = () => successfactors.extract(document).find((f) => f.kind === 'file')!;

  it('leaves a resume already attached alone', async () => {
    expect(await successfactors.fillFile(resumeField(), resume)).toBe('skipped_nonempty');
  });
  it('uploads through the dialog\'s file input', async () => {
    emptyResumeSlot();
    const set: string[] = [];
    const r = await attachResume(resumeField(), resume, 500, (input, file) => { set.push(`${input.id}:${file.name}`); });
    expect(r).toBe('filled');
    expect(set).toEqual(['104:_file:resume.pdf']);
  });
  it('errors when the dialog never opens', async () => {
    const slot = emptyResumeSlot();
    const icon = slot.querySelector<HTMLElement>('.addAttachments')!;
    icon.replaceWith(icon.cloneNode(true)); // drop the fake listener
    expect(await attachResume(resumeField(), resume, 200, () => {})).toBe('error');
  });
});
