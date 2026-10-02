import { describe, it, expect, beforeEach } from 'vitest';
import { fillField } from '../../src/fill/fillField';
import { extractFields } from '../../src/workday/extractFields';

// Mimics live Workday multiselect prompts (captured 2026-10-01): search runs only on Enter with keyCode 13
// set at event construction,
// results render in activeListContainer, and only a click on promptLeafNode adds a chip.
const MANY = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);
const CATALOG = ['Python (Programming Language)', 'Python IDLE', 'Maya Python', 'Rust', 'Computer Science', 'Computer Engineering',
  'MITRE ATT&CK Framework', ...MANY];

// autoEnter: like the live Skills prompt, Enter on an exact term adds it at once and lists it as checked.
// delays: per-query search time in ms (live searches vary; a slow one can land during the next search).
function prompt(label: string, chips: string[] = [], autoEnter = false, delays: Record<string, number> = {}) {
  document.body.innerHTML = `<div data-automation-id="formField-x"><label>${label}</label>
    <div data-automation-id="multiSelectContainer"><input type="text" placeholder="Search">
    <ul role="listbox" data-automation-id="selectedItemList">${chips.map((c) => `<li role="option" data-automation-id="selectedItem">${c}</li>`).join('')}</ul></div></div>`;
  const f = extractFields()[0]!;
  const input = f.container.querySelector('input')!;
  const chipList = f.container.querySelector('[data-automation-id="selectedItemList"]')!;
  let list: HTMLElement | undefined;
  input.addEventListener('keydown', (e) => {
    // The page can't see properties a content script defines on the event (isolated world), only init values.
    if (e.keyCode !== 13 || Object.getOwnPropertyDescriptor(e, 'keyCode')?.get) return;
    const q = input.value.toLowerCase();
    setTimeout(() => {
      list?.remove(); // only this prompt's own list; another prompt's list may still be open
      list = document.createElement('div');
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
    }, delays[q] ?? 20);
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
  it("ignores another prompt's results list left open on the page (live: Field of Study list stayed open)", async () => {
    const { f, chipTexts } = prompt('Skills');
    document.body.insertAdjacentHTML('afterbegin', `<div data-automation-id="activeListContainer" role="listbox">
      <div role="option" aria-setsize="2"><div data-automation-id="promptLeafNode" data-automation-checked="Not Checked"><div data-automation-id="promptOption" data-automation-label="Business Management Science and Computer System">x</div></div></div>
      <div role="option" aria-setsize="2"><div data-automation-id="promptLeafNode" data-automation-checked="Not Checked"><div data-automation-id="promptOption" data-automation-label="Computer and Information Science">y</div></div></div></div>`);
    expect(await fillField(f, ['Rust', 'Python'], 300)).toBe('filled');
    expect(chipTexts()).toEqual(['Rust', 'Python (Programming Language)']);
  });
  it("a slow search's late results are not taken for the next skill's (live: lag after MITRE ATT&CK)", async () => {
    // MITRE's results land at ~700ms, after its wait has ended and while Rust's slower search is still running.
    const { f, chipTexts } = prompt('Skills', [], false, { 'mitre att&ck framework': 700, rust: 500 });
    const missed: string[] = [];
    expect(await fillField(f, ['MITRE ATT&CK Framework', 'Rust'], 300, missed)).toBe('filled');
    expect(chipTexts()).toEqual(['Rust']);
    expect(missed).toEqual(['MITRE ATT&CK Framework']);
  });
  it('existing chips -> skipped, nothing typed', async () => {
    const { f, input, chipTexts } = prompt('Skills', ['Go']);
    expect(await fillField(f, ['Python'], 300)).toBe('skipped_nonempty');
    expect(chipTexts()).toEqual(['Go']);
    expect(input.value).toBe('');
  });
});
