import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { toDescriptor, type ExtractedField, type FillResult } from '../ats/field';
import { resolveProfileValue, asksHispanicYesNo, asksRaces, hispanicAnswer, racesAnswer, standardKey, type Profile, type ProfileValue } from '../profile/profile';
import type { AtsAdapter } from '../ats/types';
import { setNativeValue } from '../fill/dom';

/** `reloading`: the resume went up first and the page is about to reload with the ATS's parse of it. */
export interface AutofillReport { filled: number; skipped: number; attention: ExtractedField[]; missed: string[]; reloading?: boolean }
export interface AutofillDeps {
  profile: Profile;
  resume: File | null;
  extract: () => ExtractedField[];
  map: (fields: FieldDescriptor[]) => Promise<Map<string, ProfileKey | null>>;
  fill: AtsAdapter['fill'];
  fillFile: (f: ExtractedField, file: File) => Promise<FillResult>;
  ensureGroups: (p: Profile) => Promise<void>;
  /** Uploading the resume reloads the page (iCIMS): upload it before anything else and stop there. */
  resumeFirst?: boolean;
  /** This run follows that reload; the resume is already on file. */
  resumeDone?: boolean;
}

function flag(f: ExtractedField) {
  f.container.dataset.wfUnfilled = '1';
  f.container.style.outline = '2px solid #f59e0b';
  f.container.style.outlineOffset = '4px';
}

// A field fixed since the last run (by the user or this run) must not keep its old highlight.
function unflagAll(doc: Document) {
  for (const el of doc.querySelectorAll<HTMLElement>('[data-wf-unfilled]')) {
    delete el.dataset.wfUnfilled;
    el.style.outline = '';
    el.style.outlineOffset = '';
  }
}

export async function runAutofill(d: AutofillDeps): Promise<AutofillReport> {
  await d.ensureGroups(d.profile);
  const fields = d.extract();
  if (fields[0]) unflagAll(fields[0].container.ownerDocument);
  const report: AutofillReport = { filled: 0, skipped: 0, attention: [], missed: [] };
  if (!fields.length) return report;
  const toMap = fields.filter((f) => !f.profileKey);
  const mapping = toMap.length ? await d.map(toMap.map(toDescriptor)) : new Map<string, ProfileKey | null>();

  let resumeUploaded = false;
  // Anything filled before a reloading upload is lost, so the resume box goes first.
  const isResume = (f: ExtractedField) => (f.profileKey ?? standardKey(f.label) ?? mapping.get(f.id)) === 'resumeFile';
  const order = d.resumeFirst ? [...fields.filter(isResume), ...fields.filter((f) => !isResume(f))] : fields;
  for (const f of order) {
    if (!f.container.isConnected) continue; // e.g. "To" date removed after ticking "I currently work here"
    let key = f.profileKey ?? standardKey(f.label) ?? mapping.get(f.id) ?? null;
    // Diversity checkboxes (live Oracle): a list of races, and a lone "I am Hispanic or Latino." box.
    const raceList = f.kind === 'checkbox' && !!f.options && asksRaces(f.label);
    const hispanicBox = f.kind === 'checkbox' && !f.options && /hispanic|latin[oa]/i.test(f.container.textContent ?? '');
    if (raceList || hispanicBox) key = 'ethnicity';
    // A phone number's country list; the mapper reads it as a country code and leaves it out (live Greenhouse).
    if (f.kind === 'select' && f.section === 'Phone' && /^country(\s+code)?$/i.test(f.label)) key = 'country';
    // The mapper (and its cache) can put line 2 here.
    if (key === 'addressLine2' && /\bline\s*[3-9]\b/i.test(f.label)) key = null;
    // A resume-import box re-parses the resume and resets the form (live Oracle); it is never the resume upload.
    if (key === 'resumeFile' && /\b(import|auto-?fill|parse|populate)\b/i.test(f.label)) key = null;
    // One resume per run, and never as the cover letter (live Oracle: the resume was attached twice).
    if (key === 'resumeFile' && (resumeUploaded || /\bcover\b/i.test(f.label))) key = null;
    let result: FillResult = 'no_match';
    const missed: string[] = [];
    // A full-name or signature box takes the whole name; the mapper often says first name (live Oracle).
    const fullName = f.kind === 'text' && /\bfull\s+(legal\s+)?name\b|\bsignature\b/i.test(f.label)
      ? [d.profile.firstName, d.profile.lastName].filter(Boolean).join(' ') : '';
    // An address "Type" list has no profile value; the address is the applicant's home (live iCIMS).
    const sel = f.kind === 'select' ? (f.container.matches('select') ? f.container : f.container.querySelector('select')) : null;
    const homeAddress = !!sel && /^(address\s+)?type$/i.test(f.label.trim()) && /address/i.test(`${sel.id} ${sel.getAttribute('name') ?? ''}`);
    // A phone's device type has no profile value; the number is the applicant's mobile (live Workday "Phone Device Type").
    const phoneType = (f.kind === 'select' || f.kind === 'radio')
      && (/\bphone\b.*\btype\b|\bdevice\s+type\b/i.test(f.label) || (/^type$/i.test(f.label.trim()) && /phone/i.test(f.section ?? '')));
    if (homeAddress) {
      result = await d.fill(f, 'Home', undefined, missed);
    } else if (phoneType) {
      result = await d.fill(f, 'Mobile', undefined, missed);
    } else if (fullName) {
      // An earlier run put only the first name here; that one value is ours to correct.
      const box = f.container.matches('input') ? f.container as HTMLInputElement : f.container.querySelector<HTMLInputElement>('input');
      if (box && d.profile.lastName && box.value.trim() === d.profile.firstName) setNativeValue(box, '');
      result = await d.fill(f, fullName, undefined, missed);
    } else if (key === 'resumeFile') {
      if (d.resumeDone) result = 'skipped_nonempty';
      else if (d.resume) result = await d.fillFile(f, d.resume);
      if (result === 'filled') resumeUploaded = true;
    } else if (key) {
      let value: ProfileValue | null = resolveProfileValue(d.profile, key, f.groupIndex);
      if (key === 'ethnicity' && typeof value === 'string' && (hispanicBox || asksHispanicYesNo(f.label))) value = hispanicAnswer(value);
      if (raceList) value = racesAnswer(d.profile);
      if (typeof value === 'string' && /^(yes|no)$/.test(value)) value = value === 'yes' ? 'Yes' : 'No'; // as a person types it
      if (key === 'postalCode' && d.profile.city) f.tieBreak = d.profile.city; // one zip can list several towns
      if (value !== null) result = await d.fill(f, value, undefined, missed);
      // A school missing from a fixed list takes the list's catch-all; the applicant should know.
      if (key === 'edu.school' && result === 'no_match' && typeof value === 'string'
        && (await d.fill(f, 'not listed', undefined, missed)) === 'filled') {
        result = 'filled';
        missed.push(`${value} (picked "Not listed")`);
      }
    }
    report.missed.push(...missed);
    if (result === 'filled' && missed.length) { report.filled++; report.attention.push(f); flag(f); } // partly filled
    else if (result === 'filled') report.filled++;
    else if (result === 'skipped_nonempty') {
      report.skipped++;
      console.info('[workday-filler] already has a value:', JSON.stringify(f.label), f.kind);
    }
    else if (f.required || key) { report.attention.push(f); flag(f); }
    if (d.resumeFirst && resumeUploaded) { report.reloading = true; break; }
  }
  return report;
}

export function formatReport(r: AutofillReport): string {
  if (r.reloading) return 'Resume uploaded. The page will reload with what the site read from it; filling continues after that.';
  const missed = r.missed.length ? ` Not added, fill in by hand: ${r.missed.join(', ')}.` : '';
  return `Filled ${r.filled} fields. ${r.skipped} already had values. ${r.attention.length} need your attention (highlighted).${missed} Review, then continue.`;
}
