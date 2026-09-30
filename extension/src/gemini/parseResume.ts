import type { StoredFile } from '../storage/fileCodec';
import { normalizeProfile, SCALAR_KEYS, type Profile, type ScalarKey } from '../profile/profile';

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const SUPPORTED_RESUME_TYPES = ['application/pdf', 'text/plain'];

type Code = 'unsupported_type' | 'bad_key' | 'rate_limited' | 'bad_response' | 'network';
export class ResumeParseError extends Error {
  constructor(public code: Code, message: string) { super(message); this.name = 'ResumeParseError'; }
}

// The user fills these in during review; Gemini must not guess them.
const MANUAL_ONLY: ScalarKey[] = [
  'workAuthorized', 'requiresSponsorship', 'willingToRelocate', 'desiredSalary', 'earliestStartDate',
  'referralSource', 'gender', 'ethnicity', 'veteranStatus', 'disabilityStatus',
];
const EXTRACTED = SCALAR_KEYS.filter((k) => !MANUAL_ONLY.includes(k));

const S = { type: 'STRING' } as const;
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...Object.fromEntries(EXTRACTED.map((k) => [k, S])),
    skills: { type: 'ARRAY', items: S },
    work: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      title: S, company: S, location: S, startDate: S, endDate: S, current: { type: 'BOOLEAN' }, description: S } } },
    education: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      school: S, degree: S, fieldOfStudy: S, startDate: S, endDate: S, gpa: S } } },
  },
};

const PROMPT = `Extract the candidate's details from this resume into the JSON schema.
Use "" for anything not stated. Dates as YYYY-MM (or YYYY if month unknown).
For a current job set current=true and endDate="". state: 2-letter code if US.
Do not invent information. Keep description to the resume's bullet text for that role.`;

export async function parseResume(file: StoredFile, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Profile> {
  if (!SUPPORTED_RESUME_TYPES.includes(file.type)) {
    throw new ResumeParseError('unsupported_type', 'Upload a PDF or .txt resume (Word files are not supported — export to PDF).');
  }
  if (!apiKey) throw new ResumeParseError('bad_key', 'Enter your Gemini API key first.');
  let res: Response;
  try {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: file.type, data: file.dataBase64 } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
    });
  } catch {
    throw new ResumeParseError('network', 'Could not reach Gemini. Check your connection.');
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new ResumeParseError('bad_key', 'Gemini rejected the API key.');
  if (res.status === 429) throw new ResumeParseError('rate_limited', 'Gemini free-tier limit hit. Wait a minute and retry.');
  if (!res.ok) throw new ResumeParseError('bad_response', `Gemini error (HTTP ${res.status}).`);
  try {
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const profile = normalizeProfile(JSON.parse(text));
    for (const k of MANUAL_ONLY) profile[k] = '';
    return profile;
  } catch {
    throw new ResumeParseError('bad_response', 'Gemini returned an unreadable result. Try again.');
  }
}
