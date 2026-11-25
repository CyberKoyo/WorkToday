import { base64ToBytes, bytesToBase64, type StoredFile } from '../storage/fileCodec';
import { extractPdfLinks, fillLinkFields } from '../resume/pdfLinks';
import { readDocx } from '../resume/docx';
import { normalizeProfile, SCALAR_KEYS, type Profile, type ScalarKey } from '../profile/profile';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const SUPPORTED_RESUME_TYPES = ['application/pdf', 'text/plain', DOCX];
export const MAX_RESUME_BYTES = 14 * 1024 * 1024;

type Code = 'unsupported_type' | 'bad_key' | 'rate_limited' | 'bad_response' | 'network' | 'too_large';
export class ResumeParseError extends Error {
  constructor(public code: Code, message: string) { super(message); this.name = 'ResumeParseError'; }
}

// The user fills these in during review; Gemini must not guess them.
export const MANUAL_ONLY: ScalarKey[] = [
  'workAuthorized', 'requiresSponsorship', 'willingToRelocate', 'desiredSalary', 'earliestStartDate',
  'referralSource', 'gender', 'ethnicity', 'races', 'veteranStatus', 'disabilityStatus',
  'over18', 'under40', 'dateOfBirth', 'previouslyEmployed', 'relatedToEmployee', 'backgroundCheckConsent', 'usCitizen', 'governmentEmployee',
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
  certifications: { type: 'ARRAY', items: object({
    name: S, number: S, issuedDate: S, expirationDate: S }) },
  projects: { type: 'ARRAY', items: object({ name: S, url: S, description: S }) },
});

const PROMPT = `Extract the candidate's details from this resume into the JSON schema.
Use "" for anything not stated. Dates as YYYY-MM (or YYYY if month unknown).
For a current job set current=true and endDate="". state: 2-letter code if US.
certifications: professional certifications and licenses only, not degrees or courses.
Do not invent information. Keep description to the resume's bullet text for that role.
projects: personal, course, research or side projects the resume lists apart from jobs, with the bullet text as description
and the project's own link as url when one is given. A job is never a project.`;

function inferMimeType(file: StoredFile): string {
  // Browsers can label a .docx application/octet-stream (or leave it blank); the extension then decides.
  if (SUPPORTED_RESUME_TYPES.includes(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.docx')) return DOCX;
  return '';
}

/** The resume as a Gemini request part (a Word file goes as its text), with the links a Word file carries. */
export async function resumePart(file: StoredFile, hasKey = true): Promise<{ part: unknown; mimeType: string; links: string[] }> {
  const mimeType = inferMimeType(file);
  if (!SUPPORTED_RESUME_TYPES.includes(mimeType)) {
    throw new ResumeParseError('unsupported_type', 'Upload a PDF, .docx or .txt resume (old .doc files are not supported — save as .docx or PDF).');
  }
  if (!hasKey) throw new ResumeParseError('bad_key', 'Enter your Gemini API key first.');
  const decodedSize = Math.floor(file.dataBase64.length * 3 / 4);
  if (decodedSize > MAX_RESUME_BYTES) {
    throw new ResumeParseError('too_large', 'Resume is too large (max 14 MB). Export a smaller PDF.');
  }
  let mime = mimeType, data = file.dataBase64, links: string[] = [];
  if (mimeType === DOCX) {
    const doc = await readDocx(base64ToBytes(file.dataBase64)).catch(() => null);
    if (!doc?.text) throw new ResumeParseError('unsupported_type', 'Could not read this Word file. Save it as PDF and upload that.');
    mime = 'text/plain';
    data = bytesToBase64(new TextEncoder().encode(doc.text));
    links = doc.links;
  }
  return { part: { inline_data: { mime_type: mime, data } }, mimeType, links };
}

const MERGE = `
These files are versions of one candidate's resume. Merge them into one profile: each job and each school once, with the
fullest wording any version gives it; every skill once; contact details from whichever version states them.`;

/** One profile from the resume, or from every version of it the applicant keeps. */
export async function parseResume(file: StoredFile | StoredFile[], apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Profile> {
  const files = [file].flat();
  const read = [];
  for (const f of files) read.push(await resumePart(f, !!apiKey));
  // The limit is the request's, so the versions share it.
  if (files.reduce((n, f) => n + f.dataBase64.length * 3 / 4, 0) > MAX_RESUME_BYTES) {
    throw new ResumeParseError('too_large', 'These resumes are too large together (max 14 MB). Remove one or export smaller PDFs.');
  }
  let links = read.flatMap((r) => r.links);
  const text = await generate(apiKey, [...read.map((r) => r.part), { text: files.length > 1 ? PROMPT + MERGE : PROMPT }], RESPONSE_SCHEMA, fetchImpl);
  let parsed: Profile;
  try {
    const profile = normalizeProfile(JSON.parse(text));
    for (const k of MANUAL_ONLY) profile[k] = '';
    parsed = profile;
  } catch {
    throw new ResumeParseError('bad_response', 'Gemini returned an unreadable result. Try again.');
  }
  for (const [i, f] of files.entries()) {
    if (read[i]!.mimeType === 'application/pdf') links = [...links, ...await extractPdfLinks(base64ToBytes(f.dataBase64)).catch(() => [])];
  }
  fillLinkFields(parsed, links);
  return parsed;
}

/** Whether Google accepts the key, without spending any quota. A network failure counts as unknown (true). */
export async function keyWorks(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`, { headers: { 'x-goog-api-key': apiKey } });
    return res.status !== 400 && res.status !== 401 && res.status !== 403;
  } catch {
    return true;
  }
}

/** One structured-output Gemini call; returns the reply's JSON text. `waits`: ms before each retry of an overloaded Gemini. */
export async function generate(apiKey: string, parts: unknown[], schema: unknown, fetchImpl: typeof fetch = fetch, waits = [2000, 5000]): Promise<string> {
  if (!apiKey) throw new ResumeParseError('bad_key', 'Enter your Gemini API key first.');
  const BUSY = [500, 502, 503, 504];
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
        }),
      });
    } catch {
      throw new ResumeParseError('network', 'Could not reach Gemini. Check your connection.');
    }
    // 500/502/503/504: Gemini is busy (often "The model is overloaded"); it usually clears within seconds.
    if (!BUSY.includes(res.status) || attempt >= waits.length) break;
    await new Promise((r) => setTimeout(r, waits[attempt]));
  }
  if (BUSY.includes(res.status)) throw new ResumeParseError('bad_response', `Gemini is overloaded right now (HTTP ${res.status}). Try again in a minute.`);
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
  try {
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch {
    throw new ResumeParseError('bad_response', 'Gemini returned an unreadable result. Try again.');
  }
}
