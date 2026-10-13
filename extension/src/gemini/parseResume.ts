import type { StoredFile } from '../storage/fileCodec';
import { extractPdfLinks, fillLinkFields } from '../resume/pdfLinks';
import { normalizeProfile, SCALAR_KEYS, type Profile, type ScalarKey } from '../profile/profile';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const SUPPORTED_RESUME_TYPES = ['application/pdf', 'text/plain'];
export const MAX_RESUME_BYTES = 14 * 1024 * 1024;

type Code = 'unsupported_type' | 'bad_key' | 'rate_limited' | 'bad_response' | 'network' | 'too_large';
export class ResumeParseError extends Error {
  constructor(public code: Code, message: string) { super(message); this.name = 'ResumeParseError'; }
}

// The user fills these in during review; Gemini must not guess them.
export const MANUAL_ONLY: ScalarKey[] = [
  'workAuthorized', 'requiresSponsorship', 'willingToRelocate', 'desiredSalary', 'earliestStartDate',
  'referralSource', 'gender', 'ethnicity', 'races', 'veteranStatus', 'disabilityStatus',
  'over18', 'previouslyEmployed', 'relatedToEmployee', 'backgroundCheckConsent',
];
const EXTRACTED = SCALAR_KEYS.filter((k) => !MANUAL_ONLY.includes(k));

const S = { type: 'STRING' } as const;
// Every property is `required`: without it Gemini sometimes omits fields (e.g. email, phone) entirely.
const object = (properties: Record<string, unknown>) => ({ type: 'OBJECT', properties, required: Object.keys(properties) });
const RESPONSE_SCHEMA = object({
  ...Object.fromEntries(EXTRACTED.map((k) => [k, S])),
  skills: { type: 'ARRAY', items: S },
  work: { type: 'ARRAY', items: object({
    title: S, company: S, location: S, startDate: S, endDate: S, current: { type: 'BOOLEAN' }, description: S }) },
  education: { type: 'ARRAY', items: object({
    school: S, degree: S, fieldOfStudy: S, startDate: S, endDate: S, gpa: S }) },
});

const PROMPT = `Extract the candidate's details from this resume into the JSON schema.
Use "" for anything not stated. Dates as YYYY-MM (or YYYY if month unknown).
For a current job set current=true and endDate="". state: 2-letter code if US.
Do not invent information. Keep description to the resume's bullet text for that role.`;

function inferMimeType(file: StoredFile): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  return '';
}

export async function parseResume(file: StoredFile, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Profile> {
  const mimeType = inferMimeType(file);
  if (!SUPPORTED_RESUME_TYPES.includes(mimeType)) {
    throw new ResumeParseError('unsupported_type', 'Upload a PDF or .txt resume (Word files are not supported — export to PDF).');
  }
  if (!apiKey) throw new ResumeParseError('bad_key', 'Enter your Gemini API key first.');
  const decodedSize = Math.floor(file.dataBase64.length * 3 / 4);
  if (decodedSize > MAX_RESUME_BYTES) {
    throw new ResumeParseError('too_large', 'Resume is too large (max 14 MB). Export a smaller PDF.');
  }
  let res: Response;
  try {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: file.dataBase64 } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
    });
  } catch {
    throw new ResumeParseError('network', 'Could not reach Gemini. Check your connection.');
  }
  if (res.status === 401 || res.status === 403) throw new ResumeParseError('bad_key', 'Gemini rejected the API key.');
  if (res.status === 400 || res.status === 404) {
    let body: { error?: { message?: string; details?: Array<{ reason?: string }> } } | null = null;
    try { body = await res.json(); } catch { /* unreadable body, fall through to generic message */ }
    const isBadKey = body?.error?.details?.some((d) => d.reason === 'API_KEY_INVALID') ?? false;
    if (isBadKey) throw new ResumeParseError('bad_key', 'Gemini rejected the API key.');
    const detail = typeof body?.error?.message === 'string' ? body.error.message : 'Gemini rejected the request.';
    throw new ResumeParseError('bad_response', `Gemini error: ${detail}`);
  }
  if (res.status === 429) throw new ResumeParseError('rate_limited', 'Gemini free-tier limit hit. Wait a minute and retry.');
  if (!res.ok) throw new ResumeParseError('bad_response', `Gemini error (HTTP ${res.status}).`);
  let parsed: Profile;
  try {
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const profile = normalizeProfile(JSON.parse(text));
    for (const k of MANUAL_ONLY) profile[k] = '';
    parsed = profile;
  } catch {
    throw new ResumeParseError('bad_response', 'Gemini returned an unreadable result. Try again.');
  }
  const links = mimeType === 'application/pdf' ? await extractPdfLinks(base64ToBytes(file.dataBase64)).catch(() => []) : [];
  fillLinkFields(parsed, links);
  return parsed;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
