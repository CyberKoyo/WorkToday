import { describe, it, expect, beforeEach } from 'vitest';
import { renderProfileForm, readProfileForm, readCertProofs } from '../../src/options/profileForm';
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
  describe('certifications', () => {
    const cert = { name: 'CISSP', number: '123', issuedDate: '2020-01', expirationDate: '2023-01' };
    const stored = { name: 'old.pdf', type: 'application/pdf', dataBase64: 'AA==' };
    const entry = () => root.querySelector('[data-list="certifications"] .entry')!;
    const choose = (file: File) => Object.defineProperty(entry().querySelector('input[type="file"]'), 'files', { value: [file] });

    it('roundtrips, and shows the stored proof', () => {
      renderProfileForm(root, { ...emptyProfile(), certifications: [cert] }, { CISSP: stored });
      expect(readProfileForm(root).certifications).toEqual([cert]);
      expect(entry().textContent).toContain('old.pdf');
    });
    it('add and remove', () => {
      renderProfileForm(root, emptyProfile());
      (root.querySelector('[data-add="certifications"]') as HTMLButtonElement).click();
      expect(readProfileForm(root).certifications).toHaveLength(1);
      (root.querySelector('[data-list="certifications"] [data-remove]') as HTMLButtonElement).click();
      expect(readProfileForm(root).certifications).toHaveLength(0);
    });
    it('keeps the stored proof when no file is chosen', async () => {
      renderProfileForm(root, { ...emptyProfile(), certifications: [cert] }, { CISSP: stored });
      expect(await readCertProofs(root, { CISSP: stored })).toEqual({ CISSP: stored });
    });
    it('a chosen file replaces the stored proof', async () => {
      renderProfileForm(root, { ...emptyProfile(), certifications: [cert] }, { CISSP: stored });
      choose(new File(['x'], 'new.pdf', { type: 'application/pdf' }));
      expect((await readCertProofs(root, { CISSP: stored })).CISSP!.name).toBe('new.pdf');
    });
    it('renaming the certification keeps its proof', async () => {
      renderProfileForm(root, { ...emptyProfile(), certifications: [cert] }, { CISSP: stored });
      (entry().querySelector('[data-entry-key="name"]') as HTMLInputElement).value = 'CISSP-ISSAP';
      expect(await readCertProofs(root, { CISSP: stored })).toEqual({ 'CISSP-ISSAP': stored });
    });
    it('removing the certification drops its proof', async () => {
      renderProfileForm(root, { ...emptyProfile(), certifications: [cert] }, { CISSP: stored });
      (root.querySelector('[data-list="certifications"] [data-remove]') as HTMLButtonElement).click();
      expect(await readCertProofs(root, { CISSP: stored })).toEqual({});
    });
  });
  it('add and remove work entries', () => {
    renderProfileForm(root, sample());
    (root.querySelector('[data-add="work"]') as HTMLButtonElement).click();
    expect(readProfileForm(root).work).toHaveLength(2);
    (root.querySelector('[data-list="work"] [data-remove]') as HTMLButtonElement).click();
    expect(readProfileForm(root).work).toHaveLength(1);
  });
});
