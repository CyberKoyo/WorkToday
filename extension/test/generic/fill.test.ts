import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractGeneric } from '../../src/generic/extract';
import { fillGeneric, fillFileGeneric } from '../../src/generic/fill';

const setup = (html: string) => { document.body.innerHTML = `<form id="f">${html}</form>`; return extractGeneric(document.getElementById('f')!)[0]!; };

beforeEach(() => { document.body.innerHTML = ''; });

describe('fillGeneric', () => {
  it('text: sets, fires input, never overwrites', async () => {
    let f = setup('<div><label for="a">First</label><input id="a"></div>');
    const onInput = vi.fn(); f.container.querySelector('input')!.addEventListener('input', onInput);
    expect(await fillGeneric(f, 'Ada')).toBe('filled');
    expect(f.container.querySelector('input')!.value).toBe('Ada');
    expect(onInput).toHaveBeenCalled();
    f = setup('<div><label for="a">First</label><input id="a" value="Typed"></div>');
    expect(await fillGeneric(f, 'Ada')).toBe('skipped_nonempty');
  });
  it('text: container is the input itself', async () => {
    const f = setup('<input placeholder="Email"><input placeholder="Phone">');
    expect(f.container.tagName).toBe('INPUT');
    expect(await fillGeneric(f, 'a@b.co')).toBe('filled');
    const [a, b] = document.querySelectorAll('input');
    expect(a!.value).toBe('a@b.co');
    expect(b!.value).toBe('');
  });
  it('text: year label and date placeholder', async () => {
    let f = setup('<div><label for="y">Start date year</label><input id="y"></div>');
    await fillGeneric(f, '2019-09');
    expect(f.container.querySelector('input')!.value).toBe('2019');
    f = setup('<div><label for="s">Start Date</label><input id="s" placeholder="MM/YYYY"></div>');
    await fillGeneric(f, '2019-09');
    expect(f.container.querySelector('input')!.value).toBe('09/2019');
  });
  it('text: month/year label follows the placeholder', async () => {
    const f = setup('<div><label for="m">From (Month/Year)</label><input id="m" placeholder="MM/YYYY"></div>');
    expect(await fillGeneric(f, '2019-09')).toBe('filled');
    expect(f.container.querySelector('input')!.value).toBe('09/2019');
  });
  it('radio: never clicks an option button that would submit the form', async () => {
    const f = setup('<div role="radiogroup" aria-label="Relocate?"><button role="radio" aria-checked="false">Yes</button><button role="radio" aria-checked="false">No</button></div>');
    const submit = vi.fn((e: Event) => e.preventDefault());
    document.getElementById('f')!.addEventListener('submit', submit);
    expect(await fillGeneric(f, 'Yes')).toBe('error');
    expect(submit).not.toHaveBeenCalled();
  });
  it('textarea joins lists; booleans become Yes/No', async () => {
    let f = setup('<div><label for="t">Skills</label><textarea id="t"></textarea></div>');
    await fillGeneric(f, ['TS', 'Go']);
    expect(f.container.querySelector('textarea')!.value).toBe('TS, Go');
    f = setup('<div><label for="r">Relocate</label><input id="r"></div>');
    await fillGeneric(f, true);
    expect(f.container.querySelector('input')!.value).toBe('Yes');
  });
  it('native select: matches option, skips when chosen, no guess', async () => {
    const html = (sel = '') => `<div><label for="s">State</label><select id="s"><option value="">— Make a Selection —</option><option value="CA" ${sel}>California</option><option value="NY">New York</option></select></div>`;
    let f = setup(html());
    const onChange = vi.fn(); f.container.querySelector('select')!.addEventListener('change', onChange);
    expect(await fillGeneric(f, 'NY')).toBe('filled');
    expect(f.container.querySelector('select')!.value).toBe('NY');
    expect(onChange).toHaveBeenCalled();
    f = setup(html('selected'));
    expect(await fillGeneric(f, 'NY')).toBe('skipped_nonempty');
    f = setup(html());
    expect(await fillGeneric(f, 'Texas')).toBe('no_match');
  });
  it('select: month label picks the month name', async () => {
    const f = setup('<div><label for="m">Start date month</label><select id="m"><option value=""></option><option value="1">January</option><option value="9">September</option></select></div>');
    await fillGeneric(f, '2019-09');
    expect(f.container.querySelector('select')!.value).toBe('9');
  });
  it('native radios', async () => {
    const f = setup('<fieldset><legend>Authorized?</legend><input type="radio" name="a" id="y"><label for="y">Yes</label><input type="radio" name="a" id="n"><label for="n">No</label></fieldset>');
    expect(await fillGeneric(f, false)).toBe('filled');
    expect((document.getElementById('n') as HTMLInputElement).checked).toBe(true);
    expect(await fillGeneric(f, true)).toBe('skipped_nonempty');
  });
  it('ARIA radios', async () => {
    const f = setup('<div role="radiogroup" aria-label="Relocate?"><div role="radio" aria-checked="false">Yes</div><div role="radio" aria-checked="false">No</div></div>');
    const [yes] = f.container.querySelectorAll<HTMLElement>('[role="radio"]');
    yes!.addEventListener('click', () => yes!.setAttribute('aria-checked', 'true'));
    expect(await fillGeneric(f, 'yes')).toBe('filled');
    expect(yes!.getAttribute('aria-checked')).toBe('true');
    expect(await fillGeneric(f, 'no')).toBe('skipped_nonempty');
  });
  it('checkbox group: ticks each matching value, reports misses, keeps prior choices', async () => {
    const html = (chk = '') => `<fieldset><legend>Countries</legend><input type="checkbox" name="c" id="c1" ${chk}><label for="c1">Canada</label><input type="checkbox" name="c" id="c2"><label for="c2">Mexico</label></fieldset>`;
    let f = setup(html());
    const missed: string[] = [];
    expect(await fillGeneric(f, ['Mexico', 'Peru'], 3000, missed)).toBe('filled');
    expect((document.getElementById('c2') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('c1') as HTMLInputElement).checked).toBe(false);
    expect(missed).toEqual(['Peru']);
    f = setup(html('checked'));
    expect(await fillGeneric(f, ['Mexico'])).toBe('skipped_nonempty');
  });
  it('single checkbox ticks on yes only', async () => {
    let f = setup('<div><input type="checkbox" id="c"><label for="c">I currently work here</label></div>');
    expect(await fillGeneric(f, true)).toBe('filled');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(true);
    f = setup('<div><input type="checkbox" id="c"><label for="c">I currently work here</label></div>');
    await fillGeneric(f, false);
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(false);
  });
  it('single checkbox already ticked is left alone', async () => {
    const f = setup('<div><input type="checkbox" id="c" checked><label for="c">I currently work here</label></div>');
    expect(await fillGeneric(f, false)).toBe('skipped_nonempty');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(true);
  });
  it('date input with a value is left alone', async () => {
    const f = setup('<div><label for="d">Start</label><input id="d" type="date" value="2020-01-15"></div>');
    expect(await fillGeneric(f, '2019-09')).toBe('skipped_nonempty');
    expect(f.container.querySelector('input')!.value).toBe('2020-01-15');
  });
  it('date input takes the first of the month', async () => {
    const f = setup('<div><label for="d">Start</label><input id="d" type="date"></div>');
    expect(await fillGeneric(f, '2019-09')).toBe('filled');
    expect(f.container.querySelector('input')!.value).toBe('2019-09-01');
  });
});

describe('fillFileGeneric', () => {
  it('sets the file once', async () => {
    const f = setup('<div><label for="cv">Resume</label><input id="cv" type="file"></div>');
    const set = vi.fn((input: HTMLInputElement) => { Object.defineProperty(input, 'files', { value: [{}], configurable: true }); });
    expect(await fillFileGeneric(f, new File(['x'], 'cv.pdf'), set)).toBe('filled');
    expect(set).toHaveBeenCalledOnce();
    expect(await fillFileGeneric(f, new File(['x'], 'cv.pdf'), set)).toBe('skipped_nonempty');
  });
});
