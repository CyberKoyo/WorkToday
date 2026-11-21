import { describe, it, expect, vi } from 'vitest';
import { answerable, answerKey, readAnswer, rememberable, rememberAnswers } from '../../src/answers/remembered';
import type { ExtractedField } from '../../src/ats/field';

const field = (over: Partial<ExtractedField>): ExtractedField =>
  ({ id: 'wf-0', label: 'Q', kind: 'text', required: false, groupIndex: 0, container: document.body, ...over });

// happy-dom has no isTrusted: say what each event is.
let trusted = true;
Object.defineProperty(Event.prototype, 'isTrusted', { get: () => trusted, configurable: true });

describe('remembered answers', () => {
  it("never saves what the page's own script typed", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="a"><input type="text"></div>';
    const a = field({ label: 'Years of experience', container: document.getElementById('a')! });
    const save = vi.fn();
    rememberAnswers([a], save);
    a.container.querySelector('input')!.value = '40';
    trusted = false;
    a.container.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
    trusted = true;
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('only short or choice answers about nothing personal or legal', () => {
    expect(answerable(field({ label: 'Are you currently enrolled at an educational institution?', kind: 'radio', options: ['Yes', 'No'] }))).toBe(true);
    expect(answerable(field({ label: 'How did you hear about us?', kind: 'checkbox', options: ['LinkedIn', 'Other'] }))).toBe(true);
    expect(answerable(field({ label: 'Why do you want to work here?', kind: 'textarea' }))).toBe(false);
    expect(answerable(field({ label: 'Resume', kind: 'file' }))).toBe(false);
    expect(answerable(field({ label: 'I confirm I have read the above.', kind: 'checkbox' }))).toBe(false);
    for (const label of ['Are you legally authorized to work in the US?', 'Will you require sponsorship?', 'Which option best describes your gender identity?',
      'How do you identify your racial or ethnic background?', 'Do you identify as having a disability?', 'Pronouns', 'Expected salary',
      'Are you a current or previously serving member in the military or armed forces?']) {
      expect(answerable(field({ label, kind: 'radio', options: ['Yes', 'No'] })), label).toBe(false);
    }
  });
  it('also keeps written answers, but never personal ones or a "why" about one employer', () => {
    expect(rememberable(field({ label: 'Please list three other departments you would be interested in:', kind: 'textarea' }))).toBe(true);
    expect(answerable(field({ label: 'Please list three other departments you would be interested in:', kind: 'textarea' }))).toBe(false); // never Gemini
    expect(rememberable(field({ label: 'Why do you want to work here?', kind: 'textarea' }))).toBe(false);
    expect(rememberable(field({ label: 'Do you require visa sponsorship? Explain.', kind: 'textarea' }))).toBe(false);
    document.body.innerHTML = '<div id="w"><label>Area of study</label><textarea> Computer Science </textarea></div>';
    expect(readAnswer(field({ kind: 'textarea', container: document.getElementById('w')! }))).toBe('Computer Science');
  });
  it('keys by kind and normalized label', () => {
    expect(answerKey({ kind: 'radio', label: 'Are you  currently enrolled?' })).toBe(answerKey({ kind: 'radio', label: 'are you currently enrolled' }));
  });
  it('reads text, Yes/No buttons, checkbox groups and selects', () => {
    document.body.innerHTML = `<div id="t"><input type="text" value=" 3 "></div>
      <div id="y"><button aria-pressed="false">Yes</button><button aria-pressed="true">No</button></div>
      <div id="c"><input type="checkbox" checked><input type="checkbox"><input type="checkbox" checked></div>
      <div id="s"><select><option value="">Pick</option><option value="b" selected>Beta</option></select></div>`;
    const el = (id: string) => document.getElementById(id)!;
    expect(readAnswer(field({ container: el('t') }))).toBe('3');
    expect(readAnswer(field({ kind: 'radio', container: el('y'), options: ['Yes', 'No'], members: [...el('y').querySelectorAll('button')] }))).toBe('No');
    expect(readAnswer(field({ kind: 'checkbox', container: el('c'), options: ['A', 'B', 'C'] }))).toEqual(['A', 'C']);
    expect(readAnswer(field({ kind: 'select', container: el('s') }))).toBe('Beta');
    expect(readAnswer(field({ container: el('y'), kind: 'radio', options: ['Yes', 'No'], members: [] }))).toBeNull();
  });
  it('reads Workday choices: a prompt chip, a dropdown button, and "Select One" as none (live RTX)', () => {
    document.body.innerHTML = `
      <div id="p"><input type="text" placeholder="Search"><div data-automation-id="selectedItem">United States of America (+1)</div></div>
      <div id="d"><button aria-haspopup="listbox">Mobile</button></div>
      <div id="e"><button aria-haspopup="listbox">Select One</button></div>`;
    const el = (id: string) => document.getElementById(id)!;
    expect(readAnswer(field({ container: el('p') }))).toBe('United States of America (+1)');
    expect(readAnswer(field({ kind: 'select', container: el('d') }))).toBe('Mobile');
    expect(readAnswer(field({ kind: 'select', container: el('e') }))).toBeNull();
  });
  it('saves what the applicant settles on, once per field, and never personal answers', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="a"><input type="text"></div><div id="b"><input type="text"></div>';
    const a = field({ label: 'Years of experience', container: document.getElementById('a')! });
    const b = field({ label: 'Pronouns', container: document.getElementById('b')! });
    const save = vi.fn();
    rememberAnswers([a, b], save);
    rememberAnswers([a], save); // a second run does not listen twice
    for (const [f, v] of [[a, '4'], [b, 'they/them']] as const) {
      const input = f.container.querySelector('input')!;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    vi.advanceTimersByTime(600);
    expect(save.mock.calls).toEqual([[answerKey(a), '4']]);
    vi.useRealTimers();
  });
});
