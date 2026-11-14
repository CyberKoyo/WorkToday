import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fillCombobox, comboboxOptions, comboboxValue } from '../../src/generic/combobox';
import { fillGeneric } from '../../src/generic/fill';

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

// Oracle cx-select (live 2026-10-12): the input's aria-controls names a role="grid" popup of role="gridcell"
// items, rendered on open and filtered as you type; a click puts the item's text in the input.
function fakeCxSelect(name: string, options: string[], { searchOnly = false } = {}) {
  document.body.insertAdjacentHTML('beforeend', `<div class="cx-select-container"><label id="${name}-l" for="${name}">${name}</label>
    <input name="${name}" id="${name}" type="text" role="combobox" aria-haspopup="grid" aria-controls="${name}-listbox"
      aria-expanded="false" aria-labelledby="${name}-l" class="cx-select-input"></div>`);
  const input = document.getElementById(name) as HTMLInputElement;
  const c = input.parentElement!;
  const render = (list: string[]) => {
    document.getElementById(`${name}-listbox`)?.remove();
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid'); grid.id = `${name}-listbox`; grid.className = 'cx-select__list';
    list.forEach((o, i) => {
      grid.insertAdjacentHTML('beforeend', `<div role="row"><div tabindex="-1" role="gridcell" id="${name}-listitem-${i}" aria-selected="false" class="cx-select__list-item"><div class="cx-select__list-item-container"><span class="cx-select__list-item--content"><span class="highlight"></span><span>${o}</span></span></div></div></div>`);
    });
    grid.querySelectorAll('[role="gridcell"]').forEach((cell) => cell.addEventListener('click', () => {
      input.value = cell.textContent!;
      grid.remove();
      input.setAttribute('aria-expanded', 'false');
    }));
    document.body.append(grid);
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('click', () => { if (!searchOnly) render(options); });
  input.addEventListener('input', () => render(options.filter((o) => o.toLowerCase().includes(input.value.toLowerCase()))));
  return c;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('fillCombobox: Oracle cx-select grid', () => {
  it('picks a gridcell from the popup the input controls', async () => {
    const c = fakeCxSelect('region2', ['AK', 'AL', 'NJ', 'NY']);
    expect(await fillCombobox(c, 'NY', 200)).toBe('filled');
    expect(comboboxValue(c)).toBe('NY');
  });
  it('searches by typing when the list needs it', async () => {
    const c = fakeCxSelect('school', ['Stony Brook University', 'Stanford University'], { searchOnly: true });
    expect(await fillCombobox(c, 'Stony Brook University', 200)).toBe('filled');
    expect(comboboxValue(c)).toBe('Stony Brook University');
  });
  it('a tie among zip results is broken by the city (live: 11372 lists three neighbourhoods)', async () => {
    const zips = ['11372, Floral Park, Queens, NY', '11372, Flushing, Queens, NY', '11372, Jackson Heights, Queens, NY'];
    const c = fakeCxSelect('postalCode', zips, { searchOnly: true });
    expect(await fillCombobox(c, '11372', 200, 'Jackson Heights')).toBe('filled');
    expect(comboboxValue(c)).toBe('11372, Jackson Heights, Queens, NY');
    document.body.innerHTML = '';
    expect(await fillCombobox(fakeCxSelect('postalCode', zips, { searchOnly: true }), '11372', 200)).toBe('no_match');
    document.body.innerHTML = '';
    expect(await fillCombobox(fakeCxSelect('postalCode', zips, { searchOnly: true }), '11372', 200, 'Astoria')).toBe('no_match');
  });
  it("reads only its own popup, not another combobox's", async () => {
    fakeCxSelect('other', ['NY']);
    document.getElementById('other')!.click(); // its grid stays open
    const c = fakeCxSelect('region2', ['NJ', 'NY']);
    expect(await fillCombobox(c, 'NY', 200)).toBe('filled');
    expect((document.getElementById('other') as HTMLInputElement).value).toBe('');
    expect(comboboxValue(c)).toBe('NY');
  });
});

describe('reading and multi-select (live Greenhouse: options exist only while the list is open)', () => {
  it('comboboxOptions opens the list, reads it, closes it and picks nothing', async () => {
    const c = fakeSelect(['May/June 2029', 'December 2029/January 2030', 'Other']);
    const input = c.querySelector('input')!;
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') c.querySelector('.select__menu')?.remove(); });
    expect(await comboboxOptions(c, 200)).toEqual(['May/June 2029', 'December 2029/January 2030', 'Other']);
    expect(c.querySelector('.select__menu')).toBeNull();
    expect(comboboxValue(c)).toBe('');
  });
  it('a multi-select takes each choice in turn and reports the ones it does not list', async () => {
    document.body.innerHTML = `<div class="select__container"><label id="l-label" for="l">Locations</label>
      <div class="select__value-container select__value-container--is-multi"><input id="l" role="combobox" class="select__input"></div></div>`;
    const c = document.querySelector<HTMLElement>('.select__container')!;
    const input = c.querySelector('input')!;
    input.addEventListener('mousedown', () => { // react-select: the list closes after each pick and drops what is taken
      const menu = document.createElement('div');
      menu.className = 'select__menu';
      for (const o of ['New York, NY', 'Austin, TX', 'San Francisco, CA'].filter((x) => !c.textContent!.includes(x))) {
        const d = document.createElement('div');
        d.setAttribute('role', 'option');
        d.textContent = o;
        d.addEventListener('click', () => { menu.remove(); input.insertAdjacentHTML('beforebegin', `<div class="select__multi-value">${o}</div>`); });
        menu.append(d);
      }
      c.append(menu);
    });
    const missed: string[] = [];
    const f = { id: 'wf-0', label: 'Locations', kind: 'select' as const, required: true, groupIndex: 0, container: c, multi: true };
    expect(await fillGeneric(f, ['New York, NY', 'Austin, TX', 'Remote'], 100, missed)).toBe('filled');
    expect([...c.querySelectorAll('.select__multi-value')].map((e) => e.textContent)).toEqual(['New York, NY', 'Austin, TX']);
    expect(missed).toEqual(['Remote']);
    expect(await fillGeneric(f, ['San Francisco, CA'], 100, [])).toBe('skipped_nonempty'); // what is there stays the applicant's
  });
});

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
