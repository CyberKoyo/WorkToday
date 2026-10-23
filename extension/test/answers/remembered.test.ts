import { describe, it, expect, vi } from 'vitest';
import { answerable, answerKey, readAnswer, rememberAnswers } from '../../src/answers/remembered';
import type { ExtractedField } from '../../src/ats/field';

const field = (over: Partial<ExtractedField>): ExtractedField =>
  ({ id: 'wf-0', label: 'Q', kind: 'text', required: false, groupIndex: 0, container: document.body, ...over });

describe('remembered answers', () => {
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
