import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addTimelineEntries } from '../../src/oracle/timeline';
import { emptyProfile, emptyWork, emptyEdu, type Profile } from '../../src/profile/profile';

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
