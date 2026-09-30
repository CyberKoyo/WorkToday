import { describe, it, expect, beforeEach } from 'vitest';
import { renderProfileForm, readProfileForm } from '../../src/options/profileForm';
import { emptyProfile } from '../../src/profile/profile';

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')!; });

const sample = () => ({
  ...emptyProfile(), firstName: 'Ada', workAuthorized: 'yes', skills: ['TS', 'Go'],
  work: [{ title: 'Eng', company: 'X', location: 'NYC', startDate: '2020-01', endDate: '', current: true, description: 'Built <b>things</b>' }],
});

describe('profileForm', () => {
  it('roundtrips a profile', () => {
    const p = sample();
    renderProfileForm(root, p);
    const { reviewed, ...rest } = p;
    expect(readProfileForm(root)).toEqual(rest);
  });
  it('reads edits', () => {
    renderProfileForm(root, sample());
    (root.querySelector('[data-key="lastName"]') as HTMLInputElement).value = 'Lovelace';
    (root.querySelector('[data-key="gender"]') as HTMLSelectElement).value = 'decline';
    expect(readProfileForm(root)).toMatchObject({ lastName: 'Lovelace', gender: 'decline' });
  });
  it('does not render user text as HTML', () => {
    renderProfileForm(root, sample());
    expect(root.querySelector('b')).toBeNull();
  });
  it('add and remove work entries', () => {
    renderProfileForm(root, sample());
    (root.querySelector('[data-add="work"]') as HTMLButtonElement).click();
    expect(readProfileForm(root).work).toHaveLength(2);
    (root.querySelector('[data-list="work"] [data-remove]') as HTMLButtonElement).click();
    expect(readProfileForm(root).work).toHaveLength(1);
  });
});
