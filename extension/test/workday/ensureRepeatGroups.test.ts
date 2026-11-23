import { describe, it, expect, vi } from 'vitest';

// The catalog has only Security+: picking it adds a chip, anything else finds no match.
vi.mock('../../src/fill/fillField', () => ({
  fillField: async (f: { container: HTMLElement }, value: string) => {
    if (value !== 'CompTIA Security+' && value !== 'Security+ CE') return 'no_match';
    f.container.querySelector('[data-automation-id="multiSelectContainer"]')!.insertAdjacentHTML('beforeend', '<div data-automation-id="selectedItem">CompTIA Security+ - CompTIA</div>');
    return 'filled';
  },
}));
import { ensureRepeatGroups } from '../../src/workday/ensureRepeatGroups';
import { emptyCert, emptyEdu, emptyProfile, emptyWork } from '../../src/profile/profile';

// A certifications section whose Add appends a row with a prompt and a trash button that removes it.
function certSection() {
  document.body.innerHTML = `<h3 id="Certifications-section">Certifications</h3>
    <div role="group" aria-labelledby="Certifications-section"><button data-automation-id="add-button">Add</button></div>`;
  const sec = document.querySelector('[aria-labelledby="Certifications-section"]')!;
  sec.querySelector('button')!.addEventListener('click', () => {
    const g = document.createElement('div');
    g.setAttribute('role', 'group');
    g.innerHTML = `<div data-automation-id="formField-certification"><div data-automation-id="multiSelectContainer"><input></div></div>
      <button><svg class="wd-icon-trash"></svg></button>`;
    g.querySelector('button')!.addEventListener('click', () => g.remove());
    sec.append(g);
  });
}

describe('ensureRepeatGroups', () => {
  it('clicks Add until there are enough work groups', async () => {
    document.body.innerHTML = '<div data-automation-id="workExperienceSection"><button data-automation-id="add-button">Add</button></div>';
    const sec = document.querySelector('[data-automation-id="workExperienceSection"]')!;
    let n = 0;
    sec.querySelector('button')!.addEventListener('click', () => {
      n++; const g = document.createElement('div'); g.setAttribute('role', 'group'); sec.prepend(g);
    });
    await ensureRepeatGroups(document, { ...emptyProfile(), work: [emptyWork(), emptyWork(), emptyWork()] }, 200);
    expect(n).toBe(3);
  });
  it('finds the 2026 section markup and does not count date pickers as entries (live RTX)', async () => {
    document.body.innerHTML = `<h3 id="Education-section">Education</h3>
      <div role="group" aria-labelledby="Education-section"><button data-automation-id="add-button">Add</button></div>`;
    const sec = document.querySelector('[aria-labelledby="Education-section"]')!;
    let n = 0;
    sec.querySelector('button')!.addEventListener('click', () => {
      n++;
      const g = document.createElement('div');
      g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', `Education-${n}-panel`);
      g.innerHTML = '<div role="group" data-automation-id="dateInputWrapper"></div><div role="group" data-automation-id="dateInputWrapper"></div>';
      sec.prepend(g);
    });
    await ensureRepeatGroups(document, { ...emptyProfile(), education: [emptyEdu(), emptyEdu()] }, 200);
    expect(n).toBe(2);
  });
  it('keeps a certification the list has and deletes the row of one it lacks', async () => {
    certSection();
    const sec = document.querySelector('[aria-labelledby="Certifications-section"]')!;
    const p = { ...emptyProfile(), certifications: [{ ...emptyCert(), name: 'Missing Cert' }, { ...emptyCert(), name: 'CompTIA Security+', number: 'X1' }] };
    await ensureRepeatGroups(document, p, 200);
    const rows = sec.querySelectorAll('[role="group"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('CompTIA Security+');
    expect(p.certifications.map((c) => c.number)).toEqual(['X1']); // row 1 gets the kept cert's number
    // A second pass sees the picked row and adds nothing.
    await ensureRepeatGroups(document, p, 200);
    expect(sec.querySelectorAll('[role="group"]')).toHaveLength(1);
  });
  it('adds no second row when the chip is worded unlike the profile name, on a rerun', async () => {
    certSection();
    const sec = document.querySelector('[aria-labelledby="Certifications-section"]')!;
    const cert = () => ({ ...emptyCert(), name: 'Security+ CE', number: 'X2' });
    await ensureRepeatGroups(document, { ...emptyProfile(), certifications: [cert()] }, 200);
    const p = { ...emptyProfile(), certifications: [cert()] }; // each run reads the profile afresh
    await ensureRepeatGroups(document, p, 200);
    expect(sec.querySelectorAll('[role="group"]')).toHaveLength(1);
    expect(p.certifications.map((c) => c.number)).toEqual(['X2']);
  });
  it('keeps one row when two certifications pick the same item', async () => {
    certSection();
    const sec = document.querySelector('[aria-labelledby="Certifications-section"]')!;
    await ensureRepeatGroups(document, { ...emptyProfile(), certifications: [{ ...emptyCert(), name: 'CompTIA Security+' }, { ...emptyCert(), name: 'Security+ CE' }] }, 200);
    expect(sec.querySelectorAll('[role="group"]')).toHaveLength(1);
  });
  it('stops if Add does nothing (no infinite loop)', async () => {
    document.body.innerHTML = '<div data-automation-id="workExperienceSection"><button data-automation-id="add-button">Add</button></div>';
    await ensureRepeatGroups(document, { ...emptyProfile(), work: [emptyWork()] }, 100);
    expect(document.querySelectorAll('[role="group"]')).toHaveLength(0);
  });
  it('no section -> no-op', async () => {
    document.body.innerHTML = '';
    await expect(ensureRepeatGroups(document, { ...emptyProfile(), work: [emptyWork()] }, 50)).resolves.toBeUndefined();
  });
});
