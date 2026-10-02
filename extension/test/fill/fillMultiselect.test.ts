import { describe, it, expect, beforeEach } from 'vitest';
import { fillField } from '../../src/fill/fillField';
import { extractFields } from '../../src/workday/extractFields';

// Mimics live Workday multiselect prompts (captured 2026-10-01): search runs only on Enter with keyCode 13
// set at event construction,
// results render in activeListContainer, and only a click on promptLeafNode adds a chip.
const MANY = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);
const CATALOG = ['Python (Programming Language)', 'Python IDLE', 'Maya Python', 'Rust', 'Computer Science', 'Computer Engineering', ...MANY];

// autoEnter: like the live Skills prompt, Enter on an exact term adds it at once and lists it as checked.
function prompt(label: string, chips: string[] = [], autoEnter = false) {
  document.body.innerHTML = `<div data-automation-id="formField-x"><label>${label}</label>
    <div data-automation-id="multiSelectContainer"><input type="text" placeholder="Search">
    <ul role="listbox" data-automation-id="selectedItemList">${chips.map((c) => `<li role="option" data-automation-id="selectedItem">${c}</li>`).join('')}</ul></div></div>`;
  const f = extractFields()[0]!;
  const input = f.container.querySelector('input')!;
  const chipList = f.container.querySelector('[data-automation-id="selectedItemList"]')!;
  input.addEventListener('keydown', (e) => {
    // The page can't see properties a content script defines on the event (isolated world), only init values.
    if (e.keyCode !== 13 || Object.getOwnPropertyDescriptor(e, 'keyCode')?.get) return;
    setTimeout(() => {
      document.querySelector('[data-automation-id="activeListContainer"]')?.remove();
      const q = input.value.toLowerCase();
      const list = document.createElement('div');
      list.setAttribute('data-automation-id', 'activeListContainer'); list.setAttribute('role', 'listbox');
      const exact = autoEnter ? CATALOG.find((n) => n.toLowerCase() === q) : undefined;
      const hits = exact ? [exact] : CATALOG.filter((n) => n.toLowerCase().includes(q));
      const chipFor = (name: string) => [...chipList.children].find((c) => c.textContent === name);
      if (exact) chipList.insertAdjacentHTML('beforeend', `<li role="option" data-automation-id="selectedItem">${exact}</li>`);
      for (const name of hits) {
        const opt = document.createElement('div'); opt.setAttribute('role', 'option'); opt.setAttribute('data-automation-id', 'menuItem');
        opt.setAttribute('aria-setsize', String(hits.length));
        opt.innerHTML = `<div data-automation-id="promptLeafNode" data-automation-checked="${chipFor(name) ? 'Checked' : 'Not Checked'}"><div data-automation-id="promptOption" data-automation-label="${name}">${name}</div></div>`;
        opt.querySelector('[data-automation-id="promptLeafNode"]')!.addEventListener('click', () => {
          const chip = chipFor(name); // clicking a checked row unchecks it, like Workday
          if (chip) chip.remove();
          else chipList.insertAdjacentHTML('beforeend', `<li role="option" data-automation-id="selectedItem">${name}</li>`);
        });
        list.append(opt);
      }
      document.body.append(list);
    }, 20);
  });
  const chipTexts = () => [...f.container.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => c.textContent);
  return { f, input, chipTexts };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('fillField: multiselect prompt', () => {
  it('searches each skill and picks the exact (parenthetical-insensitive) result', async () => {
    const { f, input, chipTexts } = prompt('Skills');
    expect(await fillField(f, ['Python', 'Rust'], 300)).toBe('filled');
    expect(chipTexts()).toEqual(['Python (Programming Language)', 'Rust']);
    expect(input.value).toBe('');
  });
  it('single value (field of study)', async () => {
    const { f, chipTexts } = prompt('Field of Study');
    expect(await fillField(f, 'Computer Science', 300)).toBe('filled');
    expect(chipTexts()).toEqual(['Computer Science']);
  });
  it('skips values with no clear result, keeps the rest', async () => {
    const { f, chipTexts } = prompt('Skills');
    const missed: string[] = [];
    expect(await fillField(f, ['Cobol', 'Rust'], 300, missed)).toBe('filled');
    expect(chipTexts()).toEqual(['Rust']);
    expect(missed).toEqual(['Cobol']);
  });
  it('never guesses among ambiguous results', async () => {
    const { f, chipTexts } = prompt('Field of Study');
    const missed: string[] = [];
    expect(await fillField(f, 'Computer', 300, missed)).toBe('no_match');
    expect(missed).toEqual(['Computer']);
    expect(chipTexts()).toEqual([]);
  });
  it('fills every value, no cap', async () => {
    const { f, chipTexts } = prompt('Skills');
    expect(await fillField(f, MANY, 300)).toBe('filled');
    expect(chipTexts()).toEqual(MANY);
  });
  it('Enter that adds the skill by itself is counted, and the checked row is not clicked off again', async () => {
    const { f, chipTexts } = prompt('Skills', [], true);
    expect(await fillField(f, ['Rust', 'Python'], 300)).toBe('filled');
    expect(chipTexts()).toEqual(['Rust', 'Python (Programming Language)']);
  });
  it('existing chips -> skipped, nothing typed', async () => {
    const { f, input, chipTexts } = prompt('Skills', ['Go']);
    expect(await fillField(f, ['Python'], 300)).toBe('skipped_nonempty');
    expect(chipTexts()).toEqual(['Go']);
    expect(input.value).toBe('');
  });
});
