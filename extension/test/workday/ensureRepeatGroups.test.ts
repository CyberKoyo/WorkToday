import { describe, it, expect } from 'vitest';
import { ensureRepeatGroups } from '../../src/workday/ensureRepeatGroups';
import { emptyProfile, emptyWork } from '../../src/profile/profile';

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
