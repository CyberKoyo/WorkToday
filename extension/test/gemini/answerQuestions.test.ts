import { describe, it, expect, vi } from 'vitest';
import { answerQuestions } from '../../src/gemini/answerQuestions';
import { emptyProfile } from '../../src/profile/profile';

const reply = (answers: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answers }) }] } }] }), { status: 200 });
const fields = [
  { id: 'wf-0', label: 'Are you currently enrolled?', kind: 'radio' as const, required: true, options: ['Yes', 'No'] },
  { id: 'wf-1', label: 'Which tools have you used?', kind: 'checkbox' as const, required: false, options: ['Splunk', 'Python', 'Excel'] },
  { id: 'wf-2', label: 'Years of experience', kind: 'text' as const, required: false },
];

describe('answerQuestions', () => {
  it('sends the questions, today and the profile without its manual-only answers', async () => {
    const f = vi.fn().mockResolvedValue(reply([]));
    const profile = { ...emptyProfile(), firstName: 'Ada', gender: 'female', workAuthorized: 'yes', reviewed: true };
    await answerQuestions(fields, profile, 'K', f, new Date('2026-10-23T12:00:00Z'));
    const [, init] = f.mock.calls[0]!;
    expect(init.headers['x-goog-api-key']).toBe('K');
    const prompt: string = JSON.parse(init.body).contents[0].parts[0].text;
    expect(prompt).toContain('Today is 2026-10-23');
    expect(prompt).toContain('"firstName":"Ada"');
    expect(prompt).toContain('"question":"Which tools have you used?"');
    expect(prompt).not.toMatch(/gender|workAuthorized|reviewed/);
  });
  it('keeps answers that name an offered option, one per question but checkboxes, for known ids only', async () => {
    const f = vi.fn().mockResolvedValue(reply([
      { id: 'wf-0', answer: ['Yes', 'No'] },
      { id: 'wf-1', answer: ['Splunk', 'Kubernetes', 'Python'] },
      { id: 'wf-2', answer: [' 4 '] },
      { id: 'wf-9', answer: ['Yes'] },
    ]));
    expect(await answerQuestions(fields, emptyProfile(), 'K', f)).toEqual(new Map([
      ['wf-0', ['Yes']], ['wf-1', ['Splunk', 'Python']], ['wf-2', ['4']],
    ]));
  });
  it('leaves out empty answers and answers matching no option', async () => {
    const f = vi.fn().mockResolvedValue(reply([{ id: 'wf-0', answer: ['Maybe'] }, { id: 'wf-2', answer: [''] }]));
    expect(await answerQuestions(fields, emptyProfile(), 'K', f)).toEqual(new Map());
  });
  it('a missing key fails before any request', async () => {
    const f = vi.fn();
    await expect(answerQuestions(fields, emptyProfile(), '', f)).rejects.toMatchObject({ code: 'bad_key' });
    expect(f).not.toHaveBeenCalled();
  });
});
