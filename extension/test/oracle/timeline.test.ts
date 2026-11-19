import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addProfileTiles, addTimelineEntries } from '../../src/oracle/timeline';
import { emptyProfile, emptyWork, emptyEdu, emptyCert, type Profile } from '../../src/profile/profile';

// Mimics the live Oracle "Work and Education History" block (captured 2026-10-13): Add buttons open one inline
// editor at a time inside the apply form; its fields are named (employerName, startDate month + year, ...), date
// parts and lists are cx-select comboboxes with a role="grid" popup, and the editor's type="submit" save button
// turns it into a timeline tile (left column experience, right column education) unless a required field is empty.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = Array.from({ length: 127 }, (_, i) => String(2026 - i));

let seq = 0;
function combo(name: string, label: string, options: string[]) {
  const id = `${name}-${++seq}`;
  return `<div class="input-row"><label id="${id}-l" for="${id}">${label}</label>
    <input name="${name}" id="${id}" type="text" role="combobox" aria-controls="${id}-listbox" aria-labelledby="${id}-l" class="cx-select-input"
      data-options="${options.join('|')}"></div>`;
}
const text = (name: string, label: string, tag = 'input') =>
  `<div class="input-row"><label for="${name}-t">${label}</label>${tag === 'input' ? `<input type="text" name="${name}" id="${name}-t">` : `<textarea name="${name}" id="${name}-t"></textarea>`}</div>`;

const EDITORS = {
  experience: () => text('employerName', 'Employer Name') + text('jobTitle', 'Job Title')
    + combo('startDate', 'Start Date Month', MONTHS) + combo('startDate', 'Start Date Year', YEARS)
    + combo('endDate', 'End Date Month', MONTHS) + combo('endDate', 'End Date Year', YEARS)
    + `<div class="input-row input-row--checkbox"><input type="checkbox" class="input-row__hidden-control" id="af-checkbox-currentJobFlag-1"><label for="af-checkbox-currentJobFlag-1">Current Job</label></div>`
    + text('employerCity', 'Employer City') + text('responsibilities', 'Responsibilities', 'textarea'),
  education: () => combo('contentItemId', 'Degree', ["Bachelor's Degree", "Master's Degree"])
    + combo('major', 'Major', ['Computer Science', 'Cybersecurity'])
    + combo('educationalEstablishment', 'School', ['Stony Brook University', 'Yale University'])
    + combo('startDate', 'Start Date Month', MONTHS) + combo('startDate', 'Start Date Year', YEARS)
    + combo('endDate', 'End Date Month', MONTHS) + combo('endDate', 'End Date Year', YEARS),
};
// Live Rockland Trust (2026-11-02): Achievements in place of Responsibilities and no city; Major is free text; GPA box.
const ROCKLAND: typeof EDITORS = {
  experience: () => text('employerName', 'Employer Name') + text('jobTitle', 'Job Title')
    + combo('startDate', 'Start Date Month', MONTHS) + combo('startDate', 'Start Date Year', YEARS)
    + combo('endDate', 'End Date Month', MONTHS) + combo('endDate', 'End Date Year', YEARS)
    + `<div class="input-row input-row--checkbox"><input type="checkbox" class="input-row__hidden-control" id="af-checkbox-currentJobFlag-1"><label for="af-checkbox-currentJobFlag-1">Current Job</label></div>`
    + text('achievements', 'Achievements', 'textarea'),
  education: () => combo('contentItemId', 'Degree', ['AA', 'BS', 'MS'])
    + text('major', 'Major')
    + combo('educationalEstablishment', 'School', ['Stony Brook University', 'Other US Institution', 'Other/Autre/Otros/Andere/Altri/Ander/Outro/Inny'])
    + combo('startDate', 'Start Date Month', MONTHS) + combo('startDate', 'Start Date Year', YEARS)
    + combo('endDate', 'End Date Month', MONTHS) + combo('endDate', 'End Date Year', YEARS)
    + text('gpa', 'GPA'),
};
const REQUIRED = { experience: ['employerName', 'jobTitle'], education: ['educationalEstablishment'] };

function cxSelect() {
// cx-select: a click opens the grid popup; a click on a cell puts its text in the input.
document.addEventListener('click', (e) => {
  const box = e.target as HTMLElement;
  if (!(box instanceof HTMLInputElement) || box.getAttribute('role') !== 'combobox') return;
  document.getElementById(box.getAttribute('aria-controls')!)?.remove();
  const grid = document.createElement('div');
  grid.setAttribute('role', 'grid'); grid.id = box.getAttribute('aria-controls')!;
  for (const o of box.dataset.options!.split('|')) {
    const row = document.createElement('div'); row.setAttribute('role', 'row');
    const cell = document.createElement('div'); cell.setAttribute('role', 'gridcell'); cell.textContent = o;
    cell.addEventListener('click', () => { box.value = o; grid.remove(); });
    row.append(cell); grid.append(row);
  }
  document.body.append(grid);
});
}

function page(saved: { experience?: number; education?: number } = {}, editors = EDITORS) {
  const tile = (kind: string) => `<div class="beautiful-timeline-item" data-profile-item-tile="true">${kind}</div>`;
  document.body.innerHTML = `<form class="apply-flow__content apply-flow__content-form">
    <div class="apply-flow-block apply-flow-block--work-and-education-timeline">
      <button id="timeline-add-experience-button" type="button">Add Experience</button>
      <button id="timeline-add-education-button" type="button">Add Education</button>
      <div id="editor-slot"></div>
      <div class="beautiful-timeline">
        <div class="beautiful-timeline__column beautiful-timeline__column--left">${tile('experience').repeat(saved.experience ?? 0)}</div>
        <div class="beautiful-timeline__column beautiful-timeline__column--right">${tile('education').repeat(saved.education ?? 0)}</div>
      </div>
    </div></form>`;
  const form = document.querySelector('form')!;
  const submit = vi.fn((e: Event) => e.preventDefault());
  form.addEventListener('submit', submit);
  const savedEntries: Array<Record<string, string>> = [];

  cxSelect();

  const open = (kind: 'experience' | 'education') => {
    const slot = document.getElementById('editor-slot')!;
    if (slot.firstChild) return; // one editor at a time
    slot.innerHTML = `<div class="profile-item-editor">${editors[kind]()}
      <button type="submit" class="button app-dialog__footer-button cancel-btn">Cancel</button>
      <button type="submit" class="button app-dialog__footer-button save-btn">Add ${kind === 'experience' ? 'Experience' : 'Education'}</button></div>`;
    slot.querySelector('.save-btn')!.addEventListener('click', (e) => {
      e.preventDefault(); // Oracle's own handler; the apply form is not submitted
      const values = Object.fromEntries([...slot.querySelectorAll<HTMLInputElement>('input[name],textarea[name]')]
        .map((el, i, all) => [`${el.name}${/Date$/.test(el.name) ? (all.slice(0, i).some((p) => p.name === el.name) ? 'Year' : 'Month') : ''}`, el.value]));
      values.current = String(slot.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked ?? '');
      if (REQUIRED[kind].some((n) => !slot.querySelector<HTMLInputElement>(`[name="${n}"]`)!.value)) return; // stays open, invalid
      savedEntries.push({ kind, ...values });
      slot.innerHTML = '';
      document.querySelector(`.beautiful-timeline__column--${kind === 'experience' ? 'left' : 'right'}`)!.insertAdjacentHTML('beforeend', tile(kind));
    });
  };
  document.getElementById('timeline-add-experience-button')!.addEventListener('click', () => open('experience'));
  document.getElementById('timeline-add-education-button')!.addEventListener('click', () => open('education'));
  return { submit, savedEntries };
}

const profile = (): Profile => ({
  ...emptyProfile(), reviewed: true,
  work: [
    { ...emptyWork(), title: 'SOC Analyst Intern', company: 'Acme', location: 'New York, NY', startDate: '2025-06', endDate: '2025-08', description: 'Triage' },
    { ...emptyWork(), title: 'IT Assistant', company: 'Stony Brook University', location: 'Stony Brook, NY', startDate: '2024-01', current: true },
  ],
  education: [{ ...emptyEdu(), school: 'Stony Brook University', degree: 'BS', fieldOfStudy: 'Computer Science', startDate: '2022-08', endDate: '2026-05' }],
});

beforeEach(() => { document.body.innerHTML = ''; seq = 0; });

describe('Oracle work and education timeline', () => {
  it('adds and saves one entry per profile job and school, filled by field name', async () => {
    const { submit, savedEntries } = page();
    await addTimelineEntries(document, profile(), 100);
    expect(savedEntries).toEqual([
      { kind: 'experience', employerName: 'Acme', jobTitle: 'SOC Analyst Intern', startDateMonth: 'June', startDateYear: '2025',
        endDateMonth: 'August', endDateYear: '2025', employerCity: 'New York', responsibilities: 'Triage', current: 'false' },
      { kind: 'experience', employerName: 'Stony Brook University', jobTitle: 'IT Assistant', startDateMonth: 'January', startDateYear: '2024',
        endDateMonth: '', endDateYear: '', employerCity: 'Stony Brook', responsibilities: '', current: 'true' },
      { kind: 'education', contentItemId: "Bachelor's Degree", major: 'Computer Science', educationalEstablishment: 'Stony Brook University',
        startDateMonth: 'August', startDateYear: '2022', endDateMonth: 'May', endDateYear: '2026', current: '' },
    ]);
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('.save-btn')).toBeNull();
  });

  it('Rockland Trust editors: description into Achievements, free-text Major, GPA', async () => {
    const { savedEntries } = page({}, ROCKLAND);
    const p = profile();
    p.work = [p.work[0]!];
    p.education[0]!.gpa = '3.8';
    await addTimelineEntries(document, p, 100);
    expect(savedEntries).toEqual([
      { kind: 'experience', employerName: 'Acme', jobTitle: 'SOC Analyst Intern', startDateMonth: 'June', startDateYear: '2025',
        endDateMonth: 'August', endDateYear: '2025', achievements: 'Triage', current: 'false' },
      { kind: 'education', contentItemId: 'BS', major: 'Computer Science', educationalEstablishment: 'Stony Brook University',
        startDateMonth: 'August', startDateYear: '2022', endDateMonth: 'May', endDateYear: '2026', gpa: '3.8', current: '' },
    ]);
  });

  it('a school not in the list falls back to the multilingual Other entry', async () => {
    const { savedEntries } = page({ experience: 2 }, ROCKLAND);
    const p = profile();
    p.education[0]!.school = 'Northeastern University';
    await addTimelineEntries(document, p, 100);
    expect(savedEntries.map((e) => e.educationalEstablishment)).toEqual(['Other/Autre/Otros/Andere/Altri/Ander/Outro/Inny']);
  });

  it('adds only entries beyond those already saved (a rerun adds no duplicates)', async () => {
    const { savedEntries } = page({ experience: 1, education: 1 });
    await addTimelineEntries(document, profile(), 100);
    expect(savedEntries.map((e) => e.jobTitle ?? e.kind)).toEqual(['IT Assistant']);
  });

  it('an editor Oracle will not save is left open for the applicant, and nothing more is added', async () => {
    const { savedEntries } = page();
    const p = profile();
    p.work[0]!.company = '';
    await addTimelineEntries(document, p, 100);
    expect(savedEntries).toEqual([]);
    expect(document.querySelector('.save-btn')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('[name="jobTitle"]')!.value).toBe('SOC Analyst Intern');
  });

  it('does nothing without the timeline block', async () => {
    document.body.innerHTML = '<form><input name="x"></form>';
    await expect(addTimelineEntries(document, profile(), 100)).resolves.toBeUndefined();
  });
});

// Live Oracle "Licenses and Certificates" (2026-11-18): an Add License button opens an editor with a License or
// Certificate list, a number, and Month/Day/Year lists per date (ids month-/day-/year-issueDate-N, one shared name).
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
function certPage() {
  document.body.innerHTML = `<form class="apply-flow__content-form"><div class="apply-flow-block apply-flow-block--tile-profile-items">
    <div id="tiles"></div><div id="cert-slot"></div>
    <button id="profileItemsAddButton-1" type="button" class="button apply-flow-profile-item-tile__new-tile">Add License</button></div></form>`;
  cxSelect();
  const savedEntries: Array<Record<string, string>> = [];
  const date = (name: string, years = YEARS) => combo(name, 'Month', MONTHS) + combo(name, 'Day', DAYS) + combo(name, 'Year', years);
  document.getElementById('profileItemsAddButton-1')!.addEventListener('click', () => {
    const slot = document.getElementById('cert-slot')!;
    if (slot.firstChild) return;
    slot.innerHTML = `<div>${combo('contentItemId', 'License or Certificate', ['CompTIA Security+', 'CompTIA SecurityX'])}
      ${text('certificationNumber', 'Certificate Number')}${date('issueDate')}${date('expirationDate', Array.from({ length: 60 }, (_, i) => String(2050 - i)))}
      <button class="button app-dialog__footer-button cancel-btn">Cancel</button>
      <button class="button app-dialog__footer-button save-btn">Add License</button></div>`;
    slot.querySelector('.cancel-btn')!.addEventListener('click', (e) => { e.preventDefault(); slot.innerHTML = ''; });
    slot.querySelector('.save-btn')!.addEventListener('click', (e) => {
      e.preventDefault();
      const v = (sel: string) => [...slot.querySelectorAll<HTMLInputElement>(sel)].map((el) => el.value).join('/');
      const name = v('[name="contentItemId"]');
      savedEntries.push({ name, number: v('[name="certificationNumber"]'), issued: v('[name="issueDate"]'), expires: v('[name="expirationDate"]') });
      slot.innerHTML = '';
      document.getElementById('tiles')!.insertAdjacentHTML('beforeend', `<div data-profile-item-tile="true">${name}</div>`);
    });
  });
  return { savedEntries };
}

describe('Oracle licenses and certificates', () => {
  const certs = (): Profile => ({ ...emptyProfile(), certifications: [
    { ...emptyCert(), name: 'Google Cybersecurity Certificate' },
    { ...emptyCert(), name: 'CompTIA Security+', number: 'COMP001', issuedDate: '2024-03-15', expirationDate: '2027-03' },
  ] });
  it('cancels a certification the list lacks and saves the rest with number and Month/Day/Year dates', async () => {
    const { savedEntries } = certPage();
    await addProfileTiles(document, certs(), 100);
    expect(savedEntries).toEqual([{ name: 'CompTIA Security+', number: 'COMP001', issued: 'March/15/2024', expires: 'March/1/2027' }]);
    expect(document.querySelector('.save-btn')).toBeNull();
    // A rerun adds no duplicate.
    await addProfileTiles(document, certs(), 100);
    expect(savedEntries).toHaveLength(1);
  });
});

// Live Tenet (2026-11-19): the same tile layout for Experience and Education. School Name and Major are free text,
// there is no degree, and Education has a projected completion date in place of start/end dates.
function tilesPage() {
  const COUNTRIES = ['Canada', 'United States'];
  const editors: Record<string, () => string> = {
    Experience: () => text('employerName', 'Employer Name') + text('jobTitle', 'Job Title')
      + combo('startDate', 'Month', MONTHS) + combo('startDate', 'Year', YEARS) + combo('endDate', 'Month', MONTHS) + combo('endDate', 'Year', YEARS)
      + combo('countryCode', 'Employer Country', COUNTRIES) + text('employerCity', 'Employer City'),
    Education: () => ["Associate's Degree/College Diploma (±13 years)", "Bachelor's Degree (±16 years)", "Master's Degree (±18 years)", 'None']
      .map((d) => `<button type="button" role="radio" class="cx-select-pill-section">${d}</button>`).join('')
      + text('major', 'Major') + text('educationalEstablishment', 'School Name') + combo('countryCode', 'Country', COUNTRIES)
      + combo('projectedCompletionDate', 'Month', MONTHS) + combo('projectedCompletionDate', 'Year', ['2032', '2031', '2030', ...YEARS]),
  };
  document.body.innerHTML = `<form>${Object.keys(editors).map((k) => `<div class="apply-flow-block apply-flow-block--tile-profile-items">
    <div class="tiles"></div><div class="slot"></div><button id="profileItemsAddButton-${k}" type="button">Add ${k}</button></div>`).join('')}</form>`;
  cxSelect();
  const savedEntries: Array<Record<string, string>> = [];
  for (const [kind, html] of Object.entries(editors)) {
    const block = document.getElementById(`profileItemsAddButton-${kind}`)!.closest('.apply-flow-block')!;
    block.querySelector('button')!.addEventListener('click', () => {
      const slot = block.querySelector('.slot')!;
      if (slot.firstChild) return;
      slot.innerHTML = `<div>${html()}<button class="cancel-btn">Cancel</button><button class="save-btn">Add ${kind}</button></div>`;
      const doSave = (e: Event) => {
        e.preventDefault();
        if (!(e.currentTarget as Element).isConnected) return; // a Save no longer on the page does nothing
        const pills = [...slot.querySelectorAll('[role="radio"]')];
        if (pills.length && !pills.some((p) => p.classList.contains('cx-select-pill-section--selected'))) return; // degree required
        const values: Record<string, string> = { kind };
        const level = pills.find((p) => p.classList.contains('cx-select-pill-section--selected'));
        if (level) values.degree = level.textContent!;
        for (const el of slot.querySelectorAll<HTMLInputElement>('input[name]')) values[el.name] = values[el.name] ? `${values[el.name]}/${el.value}` : el.value;
        savedEntries.push(values);
        slot.innerHTML = '';
        block.querySelector('.tiles')!.insertAdjacentHTML('beforeend', `<div>${values.employerName ?? values.educationalEstablishment} ${values.jobTitle ?? ''}</div>`);
      };
      slot.querySelector('.save-btn')!.addEventListener('click', doSave);
      slot.querySelectorAll('[role="radio"]').forEach((p) => p.addEventListener('click', () => p.classList.add('cx-select-pill-section--selected')));
      // Picking a country redraws the editor: the Save first found is gone, and the degree pick with it (live Tenet Education).
      if (kind === 'Education') slot.querySelector('[name="countryCode"]')!.addEventListener('focus', () => {
        const old = slot.querySelector('.save-btn')!;
        const fresh = old.cloneNode(true) as HTMLElement;
        fresh.addEventListener('click', doSave);
        old.replaceWith(fresh);
        slot.querySelectorAll('[role="radio"]').forEach((p) => p.classList.remove('cx-select-pill-section--selected')); // the pick is lost too
      }, { once: true });
    });
  }
  return { savedEntries };
}

describe('Oracle tile layout: experience and education', () => {
  it('adds each job and school through its own Add button, with country and completion date', async () => {
    const { savedEntries } = tilesPage();
    const p = { ...profile(), country: 'United States' };
    p.education = [{ ...p.education[0]!, endDate: '2030-05' }]; // still to come
    await addProfileTiles(document, p, 100);
    expect(savedEntries).toEqual([
      { kind: 'Experience', employerName: 'Acme', jobTitle: 'SOC Analyst Intern', startDate: 'June/2025', endDate: 'August/2025', countryCode: 'United States', employerCity: 'New York' },
      { kind: 'Experience', employerName: 'Stony Brook University', jobTitle: 'IT Assistant', startDate: 'January/2024', endDate: '', countryCode: 'United States', employerCity: 'Stony Brook' },
      { kind: 'Education', degree: "Bachelor's Degree (±16 years)", major: 'Computer Science', educationalEstablishment: 'Stony Brook University', countryCode: 'United States', projectedCompletionDate: 'May/2030' },
    ]);
    await addProfileTiles(document, p, 100); // a rerun adds no duplicates
    expect(savedEntries).toHaveLength(3);
  });
  it('a graduation already past is not a projected completion date (Oracle will not save it)', async () => {
    const { savedEntries } = tilesPage();
    await addProfileTiles(document, { ...profile(), work: [], education: [{ ...profile().education[0]!, endDate: '2020-05' }] }, 100);
    expect(savedEntries.map((e) => e.projectedCompletionDate)).toEqual(['']);
  });
});
