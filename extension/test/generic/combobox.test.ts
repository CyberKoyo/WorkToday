import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fillCombobox, comboboxValue } from '../../src/generic/combobox';

// Minimal react-select stand-in: mousedown opens the menu (unless server-searched), typing filters it, a click selects.
function fakeSelect(options: string[], { searchOnly = false } = {}) {
  document.body.insertAdjacentHTML('beforeend', `<div class="select__container"><label id="d-label" for="d">Degree</label>
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
    <input id="d" role="combobox" aria-labelledby="d-label" class="select__input" value=""></div></div></div>`);
  const c = document.querySelector<HTMLElement>('.select__container')!;
  const input = c.querySelector('input')!;
  const render = (list: string[]) => {
    c.querySelector('.select__menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'select__menu';
    for (const o of list) {
      const d = document.createElement('div');
      d.setAttribute('role', 'option');
      d.textContent = o;
      d.addEventListener('click', () => {
        menu.remove();
        input.value = '';
        c.querySelector('.select__placeholder')!.outerHTML = `<div class="select__single-value">${o}</div>`;
      });
      menu.append(d);
    }
    c.append(menu);
  };
  input.addEventListener('mousedown', () => { if (!searchOnly) render(options); });
  input.addEventListener('input', () => render(options.filter((o) => o.toLowerCase().includes(input.value.toLowerCase()))));
  return c;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('fillCombobox', () => {
  it('opens and picks the matching option', async () => {
    const c = fakeSelect(["Bachelor's Degree", "Master's Degree"]);
    expect(await fillCombobox(c, 'Masters', 200)).toBe('filled');
    expect(comboboxValue(c)).toBe("Master's Degree");
  });
  it('types to search when the list only appears after typing', async () => {
    const c = fakeSelect(['Stanford University', 'University of Toronto'], { searchOnly: true });
    expect(await fillCombobox(c, 'Stanford University', 200)).toBe('filled');
    expect(comboboxValue(c)).toBe('Stanford University');
  });
  it('never replaces a shown value', async () => {
    const c = fakeSelect(['Yes', 'No']);
    c.querySelector('.select__placeholder')!.outerHTML = '<div class="select__single-value">No</div>';
    expect(await fillCombobox(c, 'Yes', 200)).toBe('skipped_nonempty');
  });
  it('no match: clears typed text and reports no_match', async () => {
    const c = fakeSelect(['Yes', 'No']);
    expect(await fillCombobox(c, 'Maybe later', 100)).toBe('no_match');
    expect(c.querySelector('input')!.value).toBe('');
    expect(comboboxValue(c)).toBe('');
  });
  it('ignores options that were already on the page', async () => {
    document.body.innerHTML = '<div role="option" id="stale">Master\'s Degree</div>';
    const stale = vi.fn();
    document.getElementById('stale')!.addEventListener('click', stale);
    const c = fakeSelect(["Bachelor's Degree", "Master's Degree"]);
    expect(await fillCombobox(c, 'Masters', 200)).toBe('filled');
    expect(stale).not.toHaveBeenCalled();
    expect(comboboxValue(c)).toBe("Master's Degree");
  });
  it('works when the combobox input itself is the container', async () => {
    const c = fakeSelect(["Bachelor's Degree", "Master's Degree"]);
    const input = c.querySelector<HTMLInputElement>('input')!;
    expect(await fillCombobox(input, 'Masters', 200)).toBe('filled');
    expect(comboboxValue(c)).toBe("Master's Degree");
    input.value = 'typed';
    expect(comboboxValue(input)).toBe('typed');
  });
  it('select-only combobox: its own text is the value', async () => {
    document.body.innerHTML = '<div id="c"><span id="l">Relocate?</span><div role="combobox" aria-labelledby="l" tabindex="0">No</div></div>';
    const c = document.getElementById('c')!;
    expect(comboboxValue(c)).toBe('No');
    expect(await fillCombobox(c, 'Yes', 60)).toBe('skipped_nonempty');
  });
  it('never submits the form through a button combobox', async () => {
    document.body.innerHTML = '<form id="f"><button role="combobox" aria-label="Degree"></button><button role="combobox" aria-label="School">Select</button></form>';
    const f = document.getElementById('f')!;
    const submit = vi.fn((e: Event) => e.preventDefault());
    f.addEventListener('submit', submit);
    const [empty, shown] = f.querySelectorAll<HTMLElement>('button');
    expect(await fillCombobox(empty!, 'BSc', 60)).toBe('no_match');
    expect(submit).not.toHaveBeenCalled();
    expect(await fillCombobox(shown!, 'MIT', 60)).toBe('skipped_nonempty'); // placeholder text counts as a value: the safe direction
    expect(submit).not.toHaveBeenCalled();
  });
});
