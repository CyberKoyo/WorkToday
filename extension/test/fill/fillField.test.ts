import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fillField, fillFile } from '../../src/fill/fillField';
import { extractFields } from '../../src/workday/extractFields';

const setup = (html: string) => { document.body.innerHTML = html; return extractFields()[0]!; };
const wrap = (inner: string) => `<div data-automation-id="formField-x">${inner}</div>`;

beforeEach(() => { document.body.innerHTML = ''; });

describe('fillField', () => {
  it('text: sets value and fires input/change', async () => {
    const f = setup(wrap('<label>First</label><input type="text">'));
    const input = f.container.querySelector('input')!;
    const onInput = vi.fn(); input.addEventListener('input', onInput);
    expect(await fillField(f, 'Ada')).toBe('filled');
    expect(input.value).toBe('Ada');
    expect(onInput).toHaveBeenCalled();
  });
  it('text: never overwrites existing value', async () => {
    const f = setup(wrap('<label>First</label><input type="text" value="Typed">'));
    expect(await fillField(f, 'Ada')).toBe('skipped_nonempty');
    expect(f.container.querySelector('input')!.value).toBe('Typed');
  });
  it('textarea joins lists', async () => {
    const f = setup(wrap('<label>Skills</label><textarea></textarea>'));
    await fillField(f, ['TS', 'Go']);
    expect(f.container.querySelector('textarea')!.value).toBe('TS, Go');
  });
  it('radio: matches option; skips if already chosen; no guess', async () => {
    const html = wrap('<fieldset><legend>Authorized?</legend><input type="radio" id="a"><label for="a">Yes</label><input type="radio" id="b"><label for="b">No</label></fieldset>');
    let f = setup(html);
    expect(await fillField(f, 'no')).toBe('filled');
    expect((document.getElementById('b') as HTMLInputElement).checked).toBe(true);
    expect(await fillField(f, 'yes')).toBe('skipped_nonempty');
    f = setup(html);
    expect(await fillField(f, 'maybe')).toBe('no_match');
    expect(f.container.querySelectorAll('input:checked')).toHaveLength(0);
  });
  it('checkbox', async () => {
    const f = setup(wrap('<input type="checkbox" id="c"><label for="c">I currently work here</label>'));
    expect(await fillField(f, true)).toBe('filled');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(true);
  });
  it('select: opens listbox and clicks matching option', async () => {
    const f = setup(wrap('<label>State</label><button aria-haspopup="listbox" type="button">Select One</button>'));
    const btn = f.container.querySelector('button')!;
    btn.addEventListener('click', () => {
      const lb = document.createElement('div');
      lb.setAttribute('role', 'listbox');
      lb.innerHTML = '<div role="option">Alabama</div><div role="option">California</div>';
      lb.querySelectorAll<HTMLElement>('[role="option"]').forEach((o) => o.addEventListener('click', () => { btn.textContent = o.textContent; lb.remove(); }));
      document.body.append(lb);
    });
    expect(await fillField(f, 'CA')).toBe('filled');
    expect(btn.textContent).toBe('California');
  });
  it('select: waits out a list that fills in stages (live CME Degree)', async () => {
    const f = setup(wrap('<label>Degree</label><button aria-haspopup="listbox" type="button">Select One</button>'));
    const btn = f.container.querySelector('button')!;
    btn.addEventListener('click', () => {
      const lb = document.createElement('div'); lb.setAttribute('role', 'listbox');
      lb.innerHTML = '<div role="option">Select One</div>';
      document.body.append(lb);
      setTimeout(() => {
        lb.insertAdjacentHTML('beforeend', '<div role="option">Doctorate</div><div role="option">Masters / Advanced Degree</div><div role="option">Bachelors Degree</div><div role="option">Associate Degree</div>');
        lb.querySelectorAll<HTMLElement>('[role="option"]').forEach((o) => o.addEventListener('click', () => { btn.textContent = o.textContent; lb.remove(); }));
      }, 200);
    });
    expect(await fillField(f, 'BS')).toBe('filled');
    expect(btn.textContent).toBe('Bachelors Degree');
  });
  it('select: no match closes with Escape, leaves placeholder', async () => {
    const f = setup(wrap('<label>State</label><button aria-haspopup="listbox" type="button">Select One</button>'));
    const btn = f.container.querySelector('button')!;
    const onKey = vi.fn();
    btn.addEventListener('keydown', onKey);
    btn.addEventListener('click', () => {
      const lb = document.createElement('div'); lb.setAttribute('role', 'listbox');
      lb.innerHTML = '<div role="option">Alabama</div>'; document.body.append(lb);
    });
    expect(await fillField(f, 'Mars', 300)).toBe('no_match');
    expect(onKey).toHaveBeenCalled();
    expect(btn.textContent).toBe('Select One');
  });
  it('select: ignores options from other listboxes already on the page (multiselect chips)', async () => {
    document.body.innerHTML = '<ul role="listbox" data-automation-id="selectedItemList"><li role="option">United States of America (+1)</li></ul>'
      + wrap('<label>State</label><button aria-haspopup="listbox" type="button">Select One</button>');
    const f = extractFields()[0]!;
    const btn = f.container.querySelector('button')!;
    btn.addEventListener('click', () => setTimeout(() => {
      const lb = document.createElement('div'); lb.setAttribute('role', 'listbox');
      lb.innerHTML = '<div role="option">Alabama</div><div role="option">New York</div>';
      lb.querySelectorAll<HTMLElement>('[role="option"]').forEach((o) => o.addEventListener('click', () => { btn.textContent = o.textContent; lb.remove(); }));
      document.body.append(lb);
    }, 30));
    expect(await fillField(f, 'NY')).toBe('filled');
    expect(btn.textContent).toBe('New York');
  });
  it('multiselect search box with no results: no_match, search box cleared', async () => {
    const f = setup(wrap('<label>Field of Study</label><div data-automation-id="multiSelectContainer"><input type="text" placeholder="Search"></div>'));
    expect(await fillField(f, 'Computer Science', 100)).toBe('no_match');
    expect(f.container.querySelector('input')!.value).toBe('');
  });
  it('select: already chosen is skipped', async () => {
    const f = setup(wrap('<label>State</label><button aria-haspopup="listbox" type="button">Texas</button>'));
    expect(await fillField(f, 'CA')).toBe('skipped_nonempty');
  });
  it('select: listbox never appears -> error', async () => {
    const f = setup(wrap('<label>State</label><button aria-haspopup="listbox" type="button">Select One</button>'));
    expect(await fillField(f, 'CA', 100)).toBe('error');
  });
  it('date: types month and year', async () => {
    const f = setup(wrap('<label>From</label><input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionYear-input">'));
    expect(await fillField(f, '2020-03')).toBe('filled');
    const [m, y] = f.container.querySelectorAll('input');
    expect([m!.value, y!.value]).toEqual(['03', '2020']);
  });
  it('date: a day box takes the first of the month', async () => {
    const f = setup(wrap('<label>Date Issued</label><input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionDay-input"><input data-automation-id="dateSectionYear-input">'));
    expect(await fillField(f, '2020-03')).toBe('filled');
    const [m, d, y] = f.container.querySelectorAll('input');
    expect([m!.value, d!.value, y!.value]).toEqual(['03', '01', '2020']);
  });
});

describe('fillField text commit', () => {
  it('leaves the box for real once filled, so Workday keeps the value (live RTX: last box "is required")', async () => {
    const f = setup(wrap('<label>Permanent address</label><textarea></textarea>'));
    f.kind = 'textarea';
    const box = f.container.querySelector('textarea')!;
    let blurred = false;
    box.addEventListener('blur', () => { blurred = true; });
    expect(await fillField(f, '1 Main St')).toBe('filled');
    expect(box.value).toBe('1 Main St');
    expect(blurred).toBe(true);
    expect(document.activeElement).not.toBe(box);
  });
});

describe('fillFile', () => {
  it('sets files, fires change, and is done once Workday confirms the upload', async () => {
    const f = setup(wrap('<label>Resume</label><input type="file">'));
    const set = vi.fn();
    const input = f.container.querySelector('input')!;
    input.addEventListener('change', () => setTimeout(() => input.insertAdjacentHTML('afterend', '<div data-automation-id="file-upload-successful">r.pdf</div>'), 100));
    expect(await fillFile(f, new File(['x'], 'r.pdf'), set)).toBe('filled');
    expect(set).toHaveBeenCalled();
  });
  it('an upload Workday never confirms is an error, not done (live RTX: Save and Continue ignored mid-upload)', async () => {
    const f = setup(wrap('<label>Resume</label><input type="file">'));
    expect(await fillFile(f, new File(['x'], 'r.pdf'), vi.fn(), 200)).toBe('error');
  });
  it('skips when a file is already uploaded', async () => {
    const f = setup(wrap('<label>Resume</label><input type="file"><div data-automation-id="file-upload-successful">r.pdf</div>'));
    expect(await fillFile(f, new File(['x'], 'r.pdf'), vi.fn())).toBe('skipped_nonempty');
  });
});
