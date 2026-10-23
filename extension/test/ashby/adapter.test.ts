import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ashby, fileShown } from '../../src/ashby/adapter';
import { fillFileGeneric } from '../../src/generic/fill';

const load = (c: string) => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-ashby-${c}.html`, 'utf8'); };
const field = (label: string) => ashby.extract(document).find((f) => f.label === label)!;

describe('ashby adapter', () => {
  it('detects the Ashby job board host only', () => {
    expect(ashby.detect(new URL('https://jobs.ashbyhq.com/openai/240d459b-696d-43eb-8497-fab3e56ecd9b/application'))).toBe(true);
    expect(ashby.detect(new URL('https://jobs.ashbyhq.com.evil.example/openai'))).toBe(false);
  });
  it('form page only when the application form is present', () => {
    load('openai');
    expect(ashby.isFormPage(document)).toBe(true);
    document.body.innerHTML = '<div class="ashby-job-posting-right-pane"><h1>Research Engineer</h1></div>';
    expect(ashby.isFormPage(document)).toBe(false);
  });
  it('extracts the live OpenAI form, EEO survey included', () => {
    load('openai');
    expect(ashby.extract(document).map((f) => [f.label, f.kind, f.required, f.options?.length])).toEqual([
      ['Full Name', 'text', true, undefined],
      ['Email', 'text', true, undefined],
      ['Resume', 'file', true, undefined],
      ['Phone', 'text', false, undefined],
      ['Cover Letter', 'file', false, undefined],
      ['LinkedIn Profile', 'text', false, undefined],
      ['Website', 'text', false, undefined],
      ['What is your most significant technical achievement?', 'text', false, undefined],
      ['Please provide an example or evidence of your exceptional ability.', 'text', true, undefined],
      ['Where can we find samples of your code?', 'text', false, undefined],
      ['Where can we find your publications, papers or research?', 'text', false, undefined],
      ['Are there areas of research you are particularly interested in? If so, please let us know which areas.', 'text', false, undefined],
      ['How many years of relevant experience do you have outside internships/academia?', 'radio', true, 4],
      ['How did you hear about OpenAI?', 'checkbox', false, 23],
      ['Are you authorized to work lawfully in the US?', 'radio', true, 3],
      ['When can you start a new role?', 'text', true, undefined],
      ['Are you able to work from our San Francisco HQ 3 days per week?', 'radio', true, 2],
      ['Where can we learn more about you?', 'text', false, undefined],
      ['Additional Information', 'text', false, undefined],
      ['I acknowledge that I have opened, read, and understood the Arbitration Agreement. I understand that by submitting my application, I am agreeing to be bound by the terms of the Arbitration Agreement.', 'checkbox', true, undefined],
      ['I confirm I have read the above.', 'checkbox', true, undefined],
      ['Gender', 'radio', false, 3],
      ['Race', 'radio', false, 8],
      ['Veteran Status', 'radio', false, 3],
    ]);
  });
  it('names the location autocomplete by its question, not its placeholder', () => {
    load('ramp');
    expect(field('Full Legal Name').kind).toBe('text');
    const loc = field('Where do you plan on working from (for payroll tax purposes)?');
    expect([loc.kind, loc.profileKey]).toEqual(['select', 'city']);
  });
  it('picks the location result in the profile state (live: "Austin" alone lists five towns)', async () => {
    load('ramp');
    const f = field('Where do you plan on working from (for payroll tax purposes)?');
    const box = f.container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    box.setAttribute('aria-controls', 'pop');
    const towns = ['Austin, Texas, United States', 'Austin, Minnesota, United States', 'Austin, Nevada, United States', 'Austintown, Ohio, United States'];
    box.addEventListener('input', () => {
      document.getElementById('pop')?.remove();
      const pop = Object.assign(document.createElement('div'), { id: 'pop' });
      pop.setAttribute('role', 'listbox');
      for (const t of towns) {
        const o = Object.assign(document.createElement('div'), { textContent: t });
        o.setAttribute('role', 'option');
        o.addEventListener('click', () => { box.value = t; });
        pop.append(o);
      }
      document.body.append(pop);
    });
    f.tieBreak = 'Texas';
    expect(await ashby.fill(f, 'Austin', 100)).toBe('filled');
    expect(box.value).toBe('Austin, Texas, United States');
  });
  it('answers Yes/No by pressing the button', async () => {
    load('openai');
    const f = field('Are you able to work from our San Francisco HQ 3 days per week?');
    expect(f.options).toEqual(['Yes', 'No']);
    const [yes] = f.members!;
    yes!.addEventListener('click', () => yes!.setAttribute('aria-pressed', 'true'));
    expect(await ashby.fill(f, 'Yes')).toBe('filled');
    expect(yes!.getAttribute('aria-pressed')).toBe('true');
    expect(await ashby.fill(f, 'No')).toBe('skipped_nonempty');
  });
  it('ticks the options of a checkbox group', async () => {
    load('openai');
    const f = field('How did you hear about OpenAI?');
    expect(await ashby.fill(f, ['LinkedIn'])).toBe('filled');
    expect((f.members as HTMLInputElement[]).filter((b) => b.checked).map((b) => b.name)).toEqual(['LinkedIn']);
  });
  it('fills the resume slot, not the autofill-from-resume box', async () => {
    load('openai');
    const f = field('Resume');
    const input = f.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.closest('.ashby-application-form-autofill-uploader')).toBeNull();
    let got: File | null = null;
    expect(await fillFileGeneric(f, new File(['x'], 'r.pdf'), (_, file) => { got = file; })).toBe('filled');
    expect(got).not.toBeNull();
  });
  it('uploads when the box shows no file, even if a removed file is still in the input (live)', async () => {
    load('openai');
    const f = field('Resume');
    const input = f.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: { length: 1 } }); // the removed file
    const set = vi.fn();
    expect(await fillFileGeneric(f, new File(['x'], 'r.pdf'), set, fileShown)).toBe('filled');
    expect(set).toHaveBeenCalled();
    input.closest('[data-field-path]')!.querySelector('button')!.textContent = 'Replace'; // "Koyo Keiter - Resume.docx Replace"
    expect(await fillFileGeneric(f, new File(['x'], 'r.pdf'), set, fileShown)).toBe('skipped_nonempty');
  });
});
