import { describe, it, expect } from 'vitest';
import { ensureRepeatGroups } from '../../src/workday/ensureRepeatGroups';
import { emptyCert, emptyEdu, emptyProfile, emptyWork } from '../../src/profile/profile';

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
  it('adds one certification group per profile certification', async () => {
    document.body.innerHTML = `<h3 id="Certifications-section">Certifications</h3>
      <div role="group" aria-labelledby="Certifications-section"><button data-automation-id="add-button">Add</button></div>`;
    const sec = document.querySelector('[aria-labelledby="Certifications-section"]')!;
    let n = 0;
    sec.querySelector('button')!.addEventListener('click', () => {
      n++; const g = document.createElement('div'); g.setAttribute('role', 'group'); sec.prepend(g);
    });
    await ensureRepeatGroups(document, { ...emptyProfile(), certifications: [emptyCert(), emptyCert()] }, 200);
    expect(n).toBe(2);
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
