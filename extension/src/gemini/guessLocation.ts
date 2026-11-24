import { generate } from './parseResume';

const SCHEMA = { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] };
const PROMPT = 'Below is the text of a job application page. Where is the job? Reply with the city, state or region, and '
  + 'country as the text gives them (several locations separated by "; ", or "Remote"). If the text does not say where '
  + 'the job is, reply with an empty string. Do not guess from the company\'s headquarters.\n\n';

/** Last resort for the Applications log, when the page carries no posting data: Gemini reads the page text. '' if it cannot tell. */
export async function guessLocation(text: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const reply = JSON.parse(await generate(apiKey, [{ text: PROMPT + text }], SCHEMA, fetchImpl)) as { location?: unknown };
  return typeof reply.location === 'string' ? reply.location.trim().slice(0, 300) : '';
}
