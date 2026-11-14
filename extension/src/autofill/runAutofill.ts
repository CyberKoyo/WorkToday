import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { toDescriptor, type ExtractedField, type FillResult } from '../ats/field';
import { resolveProfileValue, asksHispanicYesNo, asksRaces, hispanicAnswer, racesAnswer, standardKey, type Profile, type ProfileValue } from '../profile/profile';
import type { AtsAdapter } from '../ats/types';
import { setNativeValue } from '../fill/dom';
import { US_STATES } from '../fill/usStates';
import { answerKey, answerable } from '../answers/remembered';

/** `reloading`: the resume went up first and the page is about to reload with the ATS's parse of it.
 * `recalled`: filled from answers the applicant gave before. `answered`: filled by Gemini, highlighted for checking. */
export interface AutofillReport {
  filled: number; skipped: number; attention: ExtractedField[]; missed: string[]; reloading?: boolean;
  recalled?: number; answered?: ExtractedField[]; answerError?: string;
}
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
  /** Answers the applicant gave on earlier forms, by `answerKey`. */
  remembered?: Record<string, ProfileValue>;
  /** Answers to the questions left over, by field id (Gemini). */
  answer?: (fields: FieldDescriptor[]) => Promise<Map<string, string[]>>;
}

// Amber: needs an answer. Blue: Gemini answered it; check before submitting.
function flag(f: ExtractedField, color = '#f59e0b') {
  f.container.dataset.wfUnfilled = '1';
  f.container.style.outline = `2px solid ${color}`;
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
  const report: AutofillReport = { filled: 0, skipped: 0, attention: [], missed: [], recalled: 0, answered: [] };
  const leftover: ExtractedField[] = [];
  if (!fields.length) return report;
  const toMap = fields.filter((f) => !f.profileKey);
  const mapping = toMap.length ? await d.map(toMap.map(toDescriptor)) : new Map<string, ProfileKey | null>();

  let resumeUploaded = false;
  let otherAnswer: string | null = null; // the real answer behind a catch-all pick, for its follow-up box
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
    // The mapper reads "Pronouns" as the preferred name (live Ashby).
    if (key === 'preferredName' && /\bpronouns?\b/i.test(f.label)) key = null;
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
    // The box after a catch-all pick ("If you responded "other"…", "If your institution was not listed…") takes the real answer.
    const followUp = otherAnswer !== null && (f.kind === 'text' || f.kind === 'textarea') && /\b(other|not listed)\b/i.test(f.label);
    if (followUp) {
      result = await d.fill(f, otherAnswer!, undefined, missed);
      otherAnswer = null;
    } else if (homeAddress) {
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
      else if (!d.resumeDone) console.warn('[workday-filler] resume not uploaded:', d.resume ? `${d.resume.name} -> ${result}` : 'no resume stored');
    } else if (!key && answerable(f) && d.remembered?.[answerKey(f)] !== undefined) {
      result = await d.fill(f, d.remembered[answerKey(f)]!, undefined, missed);
      if (result === 'filled') report.recalled!++;
    } else if (key) {
      let value: ProfileValue | null = resolveProfileValue(d.profile, key, f.groupIndex);
      if (key === 'ethnicity' && typeof value === 'string' && (hispanicBox || asksHispanicYesNo(f.label))) value = hispanicAnswer(value);
      if (raceList) value = racesAnswer(d.profile);
      if (typeof value === 'string' && /^(yes|no)$/.test(value)) value = value === 'yes' ? 'Yes' : 'No'; // as a person types it
      if (key === 'postalCode' && d.profile.city) f.tieBreak = d.profile.city; // one zip can list several towns
      // One town name can be in several states (live Ashby location: "Austin, Texas" and "Austin, Minnesota").
      if (key === 'city' && d.profile.state) f.tieBreak = US_STATES[d.profile.state.trim().toUpperCase()] ?? d.profile.state;
      if (value !== null) result = await d.fill(f, value, undefined, missed);
      // A school or referral source missing from a fixed list takes the list's catch-all; the applicant should know
      // (live Ashby: no career-site choice among "How did you hear", so "Other" and its follow-up box).
      const catchAll = key === 'edu.school' ? 'Not listed' : key === 'referralSource' ? 'Other' : null;
      if (catchAll && result === 'no_match' && typeof value === 'string'
        && (await d.fill(f, 'not listed', undefined, missed)) === 'filled') {
        result = 'filled';
        missed.push(`${value} (picked "${catchAll}")`);
        otherAnswer = value;
      }
    }
    report.missed.push(...missed);
    if (result === 'filled' && missed.length) { report.filled++; report.attention.push(f); flag(f); } // partly filled
    else if (result === 'filled') report.filled++;
    else if (result === 'skipped_nonempty') {
      report.skipped++;
      console.info('[workday-filler] already has a value:', JSON.stringify(f.label), f.kind);
    }
    else if (!key && d.answer && answerable(f)) leftover.push(f);
    else if (f.required || key) { report.attention.push(f); flag(f); }
    if (d.resumeFirst && resumeUploaded) { report.reloading = true; break; }
  }
  if (leftover.length && !report.reloading) await answerLeftovers(d, leftover, report);
  return report;
}

async function answerLeftovers(d: AutofillDeps, fields: ExtractedField[], report: AutofillReport) {
  let answers = new Map<string, string[]>();
  try {
    answers = await d.answer!(fields.map(toDescriptor));
  } catch (e) {
    report.answerError = e instanceof Error ? e.message : String(e);
  }
  for (const f of fields) {
    const a = answers.get(f.id);
    const result = a ? await d.fill(f, f.kind === 'checkbox' ? a : a[0]!, undefined, []) : 'no_match';
    if (result === 'filled') { report.filled++; report.answered!.push(f); flag(f, '#3b82f6'); }
    else if (f.required) { report.attention.push(f); flag(f); }
  }
}

export function formatReport(r: AutofillReport): string {
  if (r.reloading) return 'Resume uploaded. The page will reload with what the site read from it; filling continues after that.';
  if (!r.filled && !r.skipped && !r.attention.length) return 'Found nothing to fill on this page.';
  const missed = r.missed.length ? ` Not added, fill in by hand: ${r.missed.join(', ')}.` : '';
  const recalled = r.recalled ? ` ${r.recalled} from your saved answers.` : '';
  const answered = r.answered?.length ? ` Gemini answered ${r.answered.length} (blue): check them.` : '';
  const failed = r.answerError ? ` Gemini could not answer the rest: ${r.answerError}` : '';
  return `Filled ${r.filled} fields.${recalled}${answered} ${r.skipped} already had values. ${r.attention.length} need your attention (highlighted).${missed}${failed} Review, then continue.`;
}
