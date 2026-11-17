import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { toDescriptor, type ExtractedField, type FillResult } from '../ats/field';
import { resolveProfileValue, asksHispanicYesNo, asksRaces, hispanicAnswer, racesAnswer, standardKey, plausibleKey, type Profile, type ProfileValue } from '../profile/profile';
import type { AtsAdapter } from '../ats/types';
import { setNativeValue } from '../fill/dom';
import { US_STATES } from '../fill/usStates';
import { answerKey, answerable, essay, readAnswer, rememberable } from '../answers/remembered';

/** `reloading`: the resume went up first and the page is about to reload with the ATS's parse of it.
 * `recalled`: filled from answers the applicant gave before. `answered`: answered for the applicant by Gemini or a built-in default, highlighted for checking. */
export interface AutofillReport {
  filled: number; skipped: number; attention: ExtractedField[]; missed: string[]; reloading?: boolean;
  recalled?: number; answered?: ExtractedField[]; answerError?: string;
  /** Nothing was left for the applicant, so Auto-fill pressed Next. */
  advanced?: boolean;
  /** Required consent boxes ticked for the applicant, highlighted for reading. */
  accepted?: number;
  /** One line per field: what it was taken for and what happened. Labels only, for "Copy details" on the banner. */
  log?: string[];
}
export interface AutofillDeps {
  profile: Profile;
  resume: File | null;
  extract: () => ExtractedField[];
  map: (fields: FieldDescriptor[]) => Promise<Map<string, ProfileKey | null>>;
  fill: AtsAdapter['fill'];
  fillFile: (f: ExtractedField, file: File) => Promise<FillResult>;
  /** Uploads this certification group's proof; null when none is stored. */
  proof?: (f: ExtractedField) => Promise<FillResult | null>;
  ensureGroups: (p: Profile) => Promise<void>;
  /** Uploading the resume reloads the page (iCIMS): upload it before anything else and stop there. */
  resumeFirst?: boolean;
  /** This run follows that reload; the resume is already on file. */
  resumeDone?: boolean;
  /** Answers the applicant gave on earlier forms, by `answerKey`. */
  remembered?: Record<string, ProfileValue>;
  /** Answers to the questions left over, by field id (Gemini). */
  answer?: (fields: FieldDescriptor[]) => Promise<Map<string, string[]>>;
  /** The choices of a dropdown that lists them only once opened; read for the questions that go to Gemini. */
  options?: AtsAdapter['options'];
}

// The applicant's own legal, pay and self-identification answers: a blank one is never Gemini's to supply.
const NEVER_ASKED = new Set<ProfileKey>(['workAuthorized', 'requiresSponsorship', 'desiredSalary', 'gender', 'ethnicity', 'races',
  'veteranStatus', 'disabilityStatus', 'over18', 'relatedToEmployee', 'backgroundCheckConsent', 'referralSource']);
const MAX_CHOICES = 60; // a longer list (countries, schools) is a lookup, not a question for Gemini

/** A question for Gemini. `flag`: highlight it when Gemini has no answer either. `keyed`: its profile value already failed. */
interface Leftover { flag: boolean; keyed: boolean }

// Amber: needs an answer. Blue: answered for the applicant (Gemini, or a default); check before submitting.
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
  const report: AutofillReport = { filled: 0, skipped: 0, attention: [], missed: [], recalled: 0, answered: [], accepted: 0, log: [] };
  const leftover = new Map<ExtractedField, Leftover>();
  let afterSponsor = false; // the field before this one was the sponsorship question
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
    if (f.asked?.() === false) continue; // a follow-up the earlier answers did not call for
    let key = f.profileKey ?? standardKey(f.label) ?? plausibleKey(mapping.get(f.id) ?? null, f.label);
    // A lone checkbox is a consent or a statement. The mapper reads its sentence as some yes/no profile fact, and that
    // fact's "yes" would tick an optional box while its "no" leaves a required one (reported on Adobe). Only
    // "I currently work here" is the mapper's to place on one.
    // (Workday lists no options, so a question with several boxes looks the same; it is not one to tick blindly.)
    const loneBox = f.kind === 'checkbox' && !f.options && f.container.querySelectorAll('input[type="checkbox"]').length <= 1;
    if (loneBox && key !== 'work.current' && !f.profileKey && !standardKey(f.label)) key = null;
    // A box that asks a question in words ("Why are you interested in this role?") is an essay, never a profile field:
    // a key the mapper once guessed for it would keep the draft from ever being written (its answers are cached).
    if (f.kind === 'textarea' && !f.profileKey && (/\?\s*$/.test(f.label) || /^(why|describe|explain|tell (us|me))\b/i.test(f.label))) key = null;
    // Diversity checkboxes (live Oracle): a list of races, and a lone "I am Hispanic or Latino." box.
    const raceList = f.kind === 'checkbox' && !!f.options && asksRaces(f.label);
    const hispanicBox = f.kind === 'checkbox' && !f.options && /hispanic|latin[oa]/i.test(f.container.textContent ?? '');
    if (raceList || hispanicBox) key = 'ethnicity';
    // A phone number's country list; the mapper reads it as a country code and leaves it out (live Greenhouse).
    if (f.kind === 'select' && f.section === 'Phone' && /^country(\s+code)?$/i.test(f.label)) key = 'country';
    // The mapper reads "What is your Current Degree Program?" as the field of study (live Workday RTX).
    if (key === 'edu.fieldOfStudy' && /\bdegree\b/i.test(f.label) && !/\b(major|field|stud(y|ies)|concentration|discipline)\b/i.test(f.label)) key = 'edu.degree';
    // The mapper reads "Pronouns" as the preferred name (live Ashby).
    if (key === 'preferredName' && /\bpronouns?\b/i.test(f.label)) key = null;
    // The mapper (and its cache) can put line 2 here.
    if (key === 'addressLine2' && /\bline\s*[3-9]\b/i.test(f.label)) key = null;
    // The birth date goes only where an adapter asks for it (ADP's tax credit opt-out), never where the mapper guesses.
    if (key === 'dateOfBirth' && !f.profileKey) key = null;
    // A resume-import box re-parses the resume and resets the form (live Oracle); it is never the resume upload.
    if (key === 'resumeFile' && /\b(import|auto-?fill|parse|populate)\b/i.test(f.label)) key = null;
    // A certification's upload wants its proof, never the resume (the mapper or its cache can say resume).
    if (key === 'resumeFile' && /\b(certifi|licen[sc]e)/i.test(`${f.label} ${f.section ?? ''}`)) key = 'cert.proof';
    // One resume per run, and never as the cover letter (live Oracle: the resume was attached twice).
    if (key === 'resumeFile' && (resumeUploaded || /\bcover\b/i.test(f.label))) key = null;
    let result: FillResult = 'no_match';
    let noValue = false; // the profile field this question maps to is blank
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
    // The detail box after a sponsorship question ("If yes, what type of visa?") when the applicant needs none.
    const noVisa = d.profile.requiresSponsorship === 'no' && (f.kind === 'text' || f.kind === 'textarea')
      && (/sponsor|\bvisa\b/i.test(f.label) ? /\b(if|what|which|type|specify|explain|describe|details?|list)\b/i.test(f.label)
        : afterSponsor && /^\W*if\b/i.test(f.label));
    afterSponsor = key === 'requiresSponsorship';
    // A lone box the form will not go on without ("I agree to…", live Adobe: "…may keep me informed…") can only be
    // ticked. An optional one is a choice and stays the applicant's.
    const mustAccept = !key && loneBox && f.required;
    if (f.answer !== undefined) {
      result = await d.fill(f, f.answer, undefined, missed);
    } else if (mustAccept) {
      result = await d.fill(f, true, undefined, missed);
      if (result === 'filled') { report.accepted!++; flag(f, '#3b82f6'); }
    } else if (followUp) {
      result = await d.fill(f, otherAnswer!, undefined, missed);
      otherAnswer = null;
    } else if (noVisa) {
      result = await d.fill(f, 'N/A', undefined, missed);
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
      else if (!d.resumeDone && result !== 'skipped_nonempty') console.warn('[workday-filler] resume not uploaded:', d.resume ? `${d.resume.name} -> ${result}` : 'no resume stored');
    } else if (key === 'cert.proof') {
      result = (await d.proof?.(f)) ?? (f.required ? 'no_match' : 'skipped_nonempty');
    } else if (!key && rememberable(f) && d.remembered?.[answerKey(f)] !== undefined) {
      result = await d.fill(f, d.remembered[answerKey(f)]!, undefined, missed);
      if (result === 'filled') report.recalled!++;
    } else if (key) {
      let value: ProfileValue | null = resolveProfileValue(d.profile, key, f.groupIndex);
      if (key === 'ethnicity' && typeof value === 'string' && (hispanicBox || asksHispanicYesNo(f.label))) value = hispanicAnswer(value);
      if (raceList) value = racesAnswer(d.profile);
      if (value === null && key === 'previouslyEmployed') value = 'no'; // unset: most applicants never worked there; not Gemini's guess
      if (typeof value === 'string' && /^(yes|no)$/.test(value)) value = value === 'yes' ? 'Yes' : 'No'; // as a person types it
      if (key === 'postalCode' && d.profile.city) f.tieBreak = d.profile.city; // one zip can list several towns
      // One town name can be in several states (live Ashby location: "Austin, Texas" and "Austin, Minnesota").
      if (key === 'city' && d.profile.state) f.tieBreak = US_STATES[d.profile.state.trim().toUpperCase()] ?? d.profile.state;
      // No default answer in the profile: the application is being filled in on the employer's own careers page, so
      // that is how the applicant came to it. The profile's "How did you hear about jobs" answer replaces this.
      const assumed = key === 'referralSource' && value === null;
      if (assumed) value = 'Company career site';
      noValue = value === null;
      if (value !== null) result = await d.fill(f, value, undefined, missed);
      // Nothing in the profile, yet nothing to do: an optional lone box ("I have a preferred name") rightly stays unticked (live RTX).
      else if (f.kind === 'checkbox' && !f.options && !f.required) result = 'skipped_nonempty';
      // A certification with no number or expiry has nothing to enter; flagging it would stop hands-free advance.
      else if (key.startsWith('cert.') && !f.required) result = 'skipped_nonempty';
      if (assumed && result === 'filled') { report.answered!.push(f); flag(f, '#3b82f6'); } // not the applicant's words: to check
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
    // Already answered on the page (the site's "+1" phone code, the applicant's own pick): nothing to flag (live RTX).
    if (result === 'no_match' && readAnswer(f) !== null) result = 'skipped_nonempty';
    report.missed.push(...missed);
    report.log!.push(`${f.id} ${f.kind}${f.required ? '*' : ''} key=${key} -> ${result} | ${f.label.slice(0, 80)}`);
    // Partly filled. A skill the site's catalog lacks is only noted: nothing for the applicant to pick (live RTX).
    if (result === 'filled' && missed.length && key !== 'skills') { report.filled++; report.attention.push(f); flag(f); }
    else if (result === 'filled') report.filled++;
    else if (result === 'skipped_nonempty') {
      report.skipped++;
      console.info('[workday-filler] already has a value:', JSON.stringify(f.label), f.kind);
    }
    // Gemini also takes a question the mapper tied to a profile field when that field cannot answer it. A choice whose
    // list the value is not in: "Will you have a Bachelor's by June 2029?" maps to the degree and "BS" is neither Yes
    // nor No; a graduation date of 2029-05 is not the list's "May/June 2029" (live Greenhouse). Or a required question
    // whose field is blank ("Have you worked here before?").
    else if (d.answer && (answerable(f) || essay(f))
      && (!key || (!f.profileKey && !NEVER_ASKED.has(key) && (f.kind === 'select' || !!f.options || (noValue && f.required))))) {
      leftover.set(f, { flag: f.required || !!key, keyed: !!key });
    }
    else if (f.required || key) { report.attention.push(f); flag(f); }
    if (d.resumeFirst && resumeUploaded) { report.reloading = true; break; }
  }
  if (leftover.size && !report.reloading) await answerLeftovers(d, leftover, report);
  return report;
}

async function answerLeftovers(d: AutofillDeps, fields: Map<ExtractedField, Leftover>, report: AutofillReport) {
  // Gemini picks from a dropdown's own choices; most pages list them only once the dropdown is opened.
  for (const [f, how] of fields) {
    if (f.kind !== 'select' || f.options || !d.options) continue;
    const choices = await d.options(f).catch(() => []);
    if (choices.length && choices.length <= MAX_CHOICES) f.options = choices;
    // The profile value already failed against this list; without the list Gemini's would too.
    else if (how.keyed) { fields.delete(f); report.attention.push(f); flag(f); }
  }
  if (!fields.size) return;
  let answers = new Map<string, string[]>();
  try {
    // A dropdown that takes several choices is asked like a checkbox list: every option that applies.
    answers = await d.answer!([...fields.keys()].map((f) => ({ ...toDescriptor(f), ...(f.multi ? { kind: 'checkbox' as const } : {}) })));
  } catch (e) {
    report.answerError = e instanceof Error ? e.message : String(e);
    report.log!.push(`gemini failed: ${report.answerError}`);
  }
  for (const [f, how] of fields) {
    const a = answers.get(f.id);
    const result = a ? await d.fill(f, f.kind === 'checkbox' || f.multi ? a : a[0]!, undefined, []) : 'no_match';
    report.log!.push(`gemini ${f.id} choices=${f.options?.length ?? 'none'} -> ${a ? result : 'no answer'}`);
    if (result === 'filled') { report.filled++; report.answered!.push(f); flag(f, '#3b82f6'); }
    else if (how.flag) { report.attention.push(f); flag(f); }
  }
}

export function formatReport(r: AutofillReport): string {
  if (r.reloading) return 'Resume uploaded. The page will reload with what the site read from it; filling continues after that.';
  if (!r.filled && !r.skipped && !r.attention.length) return 'Found nothing to fill on this page.';
  const missed = r.missed.length ? ` Not added, fill in by hand: ${r.missed.join(', ')}.` : '';
  const recalled = r.recalled ? ` ${r.recalled} from your saved answers.` : '';
  const answered = r.answered?.length ? ` Answered ${r.answered.length} for you (blue): check them.` : '';
  const failed = r.answerError ? ` Gemini could not answer the rest: ${r.answerError}` : '';
  const accepted = r.accepted ? ` Ticked ${r.accepted} required consent box${r.accepted > 1 ? 'es' : ''} (blue): read what you are agreeing to.` : '';
  return `Filled ${r.filled} fields.${recalled}${answered}${accepted} ${r.skipped} already had values. ${r.attention.length} need your attention (highlighted).${missed}${failed} ${r.advanced ? 'Moving to the next step.' : 'Review, then continue.'}`;
}
