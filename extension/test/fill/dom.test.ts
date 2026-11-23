import { describe, it, expect, vi } from 'vitest';
import { placeholderOption, safeClick } from '../../src/fill/dom';

describe('safeClick', () => {
  it('never clicks a button that would submit or reset its form', () => {
    document.body.innerHTML = '<form id="f"><button id="s">Next</button><button id="r" type="reset">Clear</button><button id="b" type="button">Add</button></form><button id="o">Add</button>';
    const submit = vi.fn((e: Event) => e.preventDefault());
    document.getElementById('f')!.addEventListener('submit', submit);
    const clicks = vi.fn();
    document.addEventListener('click', clicks);
    expect(safeClick(document.getElementById('s')!)).toBe(false);
    expect(safeClick(document.getElementById('r')!)).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();
    expect(safeClick(document.getElementById('b')!)).toBe(true);
    expect(safeClick(document.getElementById('o')!)).toBe(true); // outside a form there is nothing to submit
    expect(clicks).toHaveBeenCalledTimes(2);
    document.removeEventListener('click', clicks);
  });
});

describe('placeholderOption', () => {
  it('a blank or "-- No answer --" / "Please select" entry; never a real answer', () => {
    const opt = (text: string, value = text) => Object.assign(document.createElement('option'), { text, value });
    expect(['-- No answer --', 'Please select', 'Select...', 'Select One', 'Choose an option'].map((t) => placeholderOption(opt(t, 'x')))).toEqual([true, true, true, true, true]);
    expect(placeholderOption(opt('Anything', ''))).toBe(true);
    expect(['Choose not to disclose', 'No', 'Decline to answer', 'Selected by recruiter'].map((t) => placeholderOption(opt(t)))).toEqual([false, false, false, false]);
  });
});
