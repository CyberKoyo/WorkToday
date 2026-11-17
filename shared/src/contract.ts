export const PROFILE_KEYS = [
  'firstName', 'lastName', 'preferredName', 'email', 'phone',
  'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country',
  'linkedinUrl', 'websiteUrl', 'githubUrl',
  'workAuthorized', 'requiresSponsorship', 'willingToRelocate',
  'desiredSalary', 'earliestStartDate', 'referralSource',
  'gender', 'ethnicity', 'races', 'veteranStatus', 'disabilityStatus',
  'over18', 'under40', 'dateOfBirth', 'previouslyEmployed', 'relatedToEmployee', 'backgroundCheckConsent', 'usCitizen', 'governmentEmployee',
  'resumeFile', 'skills',
  'work.title', 'work.company', 'work.location', 'work.startDate', 'work.endDate', 'work.current', 'work.description',
  'edu.school', 'edu.degree', 'edu.fieldOfStudy', 'edu.startDate', 'edu.endDate', 'edu.gpa',
  'cert.name', 'cert.number', 'cert.issuedDate', 'cert.expirationDate', 'cert.proof',
] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export const FIELD_KINDS = ['text', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldDescriptor {
  id: string;            // "wf-<n>", assigned by the extension
  label: string;
  kind: FieldKind;
  options?: string[];    // radio labels (dropdown options are not known until opened)
  section?: string;      // e.g. "Work Experience 2"
  required: boolean;
}
export interface MapRequest { fields: FieldDescriptor[] }
export interface FieldMapping { id: string; profileKey: ProfileKey | null }
export interface MapResponse { mappings: FieldMapping[] }

export const MAX_FIELDS = 80;
export const MAX_LABEL_LEN = 300;
export const MAX_OPTIONS = 60;

type Result = { ok: true; value: MapRequest } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const isShortString = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_LABEL_LEN;

export function validateMapRequest(body: unknown): Result {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { fields?: unknown }).fields)) {
    return fail('fields must be an array');
  }
  const fields = (body as { fields: unknown[] }).fields;
  if (fields.length === 0) return fail('fields is empty');
  if (fields.length > MAX_FIELDS) return fail(`too many fields (max ${MAX_FIELDS})`);
  const out: FieldDescriptor[] = [];
  for (const f of fields) {
    if (!f || typeof f !== 'object') return fail('field must be an object');
    const { id, label, kind, options, section, required } = f as Record<string, unknown>;
    if (typeof id !== 'string' || !/^wf-\d{1,4}$/.test(id)) return fail('bad field id');
    if (!isShortString(label)) return fail(`bad label for ${id}`);
    if (!FIELD_KINDS.includes(kind as FieldKind)) return fail(`bad kind for ${id}`);
    if (options !== undefined && (!Array.isArray(options) || options.length > MAX_OPTIONS || !options.every(isShortString))) {
      return fail(`bad options for ${id}`);
    }
    if (section !== undefined && !isShortString(section)) return fail(`bad section for ${id}`);
    const clean: FieldDescriptor = { id, label, kind: kind as FieldKind, required: required === true };
    if (options !== undefined) clean.options = options as string[];
    if (section !== undefined) clean.section = section as string;
    out.push(clean);
  }
  return { ok: true, value: { fields: out } };
}
