import type { FieldDescriptor } from '@wf/shared';
import { MANUAL_ONLY, ResumeParseError, generate } from './parseResume';
import { matchOption } from '../fill/matchOption';
import type { Profile } from '../profile/profile';

const S = { type: 'STRING' } as const;
const SCHEMA = {
  type: 'OBJECT', required: ['answers'],
  properties: { answers: { type: 'ARRAY', items: { type: 'OBJECT', required: ['id', 'answer'], properties: { id: S, answer: { type: 'ARRAY', items: S } } } } },
};

const PROMPT = (today: string) => `You answer job application questions for the candidate in PROFILE (JSON). Today is ${today}.
Return every question's id with its answer:
- A question with options: copy the chosen option text exactly. For a checkbox question, every option that applies.
- A question without options: one short factual value (a number, date, name or URL), never a sentence.
Answer only what PROFILE supports. Work it out where you can: enrolled now when an education end date is today or later;
years of experience from the work dates; experience with a tool or field when the work or skills name it.
When PROFILE does not say, or the question asks for an opinion, a preference or availability, return an empty answer. Never guess.`;

/** Gemini's answers to questions no profile field covers, by field id. Only option texts the field offers come back. */
export async function answerQuestions(
  fields: FieldDescriptor[], profile: Profile, apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date(),
): Promise<Map<string, string[]>> {
  const facts: Record<string, unknown> = { ...profile };
  for (const k of [...MANUAL_ONLY, 'reviewed']) delete facts[k];
  const questions = fields.map(({ id, label, kind, options }) => ({ id, question: label, kind, ...(options ? { options } : {}) }));
  const text = await generate(apiKey, [{ text: `${PROMPT(now.toISOString().slice(0, 10))}\n\nPROFILE:\n${JSON.stringify(facts)}\n\nQUESTIONS:\n${JSON.stringify(questions)}` }], SCHEMA, fetchImpl);
  let raw: Array<{ id?: unknown; answer?: unknown }>;
  try { raw = (JSON.parse(text) as { answers?: typeof raw }).answers ?? []; } catch {
    throw new ResumeParseError('bad_response', 'Gemini returned an unreadable result. Try again.');
  }
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out = new Map<string, string[]>();
  for (const a of raw) {
    const f = typeof a.id === 'string' ? byId.get(a.id) : undefined;
    if (!f || !Array.isArray(a.answer)) continue;
    let answer = a.answer.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
    // An answer that names none of the field's options is dropped.
    if (f.options) answer = answer.filter((v) => matchOption(v, f.options!) !== -1);
    if (f.kind !== 'checkbox') answer = answer.slice(0, 1);
    if (answer.length) out.set(f.id, answer);
  }
  return out;
}
