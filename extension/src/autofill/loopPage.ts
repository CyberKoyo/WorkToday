import type { AtsAdapter } from '../ats/types';
import type { LoopSettings } from '../storage/store';
import { setNativeValue, TEXT_INPUT } from '../fill/dom';

/**
 * What one poll of the job loop did in a frame.
 * `acted`: pressed the application's Next or Submit. `progress`: signed in, or the resume upload is reloading the page.
 * `waiting`: already pressed on this step and the page has not moved on. `filled`: filled, and submitting is off.
 * `stuck`: the applicant is needed. null: nothing to do here (yet).
 */
export type Step = 'acted' | 'progress' | 'waiting' | 'filled' | 'stuck' | null;
/** How the Auto-fill went: nothing left for the applicant, something left, mid resume reload, no field it could fill,
 * or (null) profile not set up. */
export type Filled = 'clean' | 'attention' | 'reloading' | 'nothing' | null;

/** The loop says what it does in the console of the tab it does it in (and the background's): filter on "loop:". */
export const log = (...a: unknown[]) => console.info('[workday-filler] loop:', ...a);

const CLICKABLE = 'a, button, [role="button"]';
const visible = (el: Element) => el.getClientRects().length > 0;
const label = (el: HTMLElement) => (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
const enabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';

/**
 * Visible Apply buttons and links: a board's job list, or the way from a job posting to its form.
 * Nothing inside a <form> counts, so this never finds an application's own submit button.
 * shortcut: matched by label ("Apply…", "Easy Apply") only; boards that word it differently find nothing. Add their wording here.
 */
export function applyTargets(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(CLICKABLE)].filter((el) => /^(easy |quick )?apply\b/i.test(label(el))
    && !el.closest('form') && !el.parentElement?.closest(CLICKABLE) && visible(el));
}

// Whole labels only: "Apply with LinkedIn", "Submit a referral" and "Next job" are other buttons.
const ADVANCE = /^(submit( (my |your )?application)?|submit (and|&) continue|send( application)?|apply( now)?|next( step)?|continue|save (and|&) continue|review( (my |your )?application)?)$/i;
const FINAL = /^submit/i;

/** The button that moves an application on (Next, Save and Continue, Submit): the last such one in `root`. */
export function advanceButton(root: ParentNode, only = ADVANCE): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(`${CLICKABLE}, input[type="submit"]`)]
    .filter((el) => ADVANCE.test(label(el)) && only.test(label(el)) && visible(el) && enabled(el)).at(-1);
}

const SIGN_IN = /^(sign in|log in|login|create account|sign up|register|continue|next)$/i;
const OTHER_INPUTS = 'input:not([type="password"],[type="hidden"],[type="checkbox"],[type="radio"],[type="submit"],[type="button"]), select, textarea';

/**
 * A sign-in or create-account form is on screen: enter the saved login and press its button. False when there is none.
 * A password box among many other questions is an application that also sets a password, not a sign-in; it is left alone.
 * shortcut: no terms checkbox, no "account exists, sign in instead" switch, no email-first two-page logins; the applicant finishes those.
 */
export function signIn(doc: Document, email: string, password: string): boolean {
  const first = [...doc.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(visible);
  const scope: HTMLElement = first?.closest('form') ?? doc.body;
  if (!first || [...scope.querySelectorAll(OTHER_INPUTS)].filter(visible).length > 3) return false;
  const texts = [...scope.querySelectorAll<HTMLInputElement>(TEXT_INPUT)].filter(visible);
  const user = texts.find((el) => /e-?mail|user|login/i.test(`${el.type} ${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`)) ?? texts[0];
  if (user && !user.value) setNativeValue(user, email);
  for (const p of scope.querySelectorAll<HTMLInputElement>('input[type="password"]')) if (visible(p)) setNativeValue(p, password); // and "verify password"
  const go = [...scope.querySelectorAll<HTMLElement>(`${CLICKABLE}, input[type="submit"]`)].find((el) => SIGN_IN.test(label(el)) && visible(el) && enabled(el))
    ?? scope.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  log('signing in:', go ? `pressing "${label(go)}"` : 'no button found');
  go?.click();
  return !!go;
}

// The last thing the loop pressed in this tab on this site. It outlives a reload, so a step the site refused
// (bad password, a field it wants) is pressed once and then left to the applicant instead of over and over.
const ACTED = 'wf:loop-acted';
const acted = () => { try { return sessionStorage.getItem(ACTED); } catch { return null; } };
const markActed = (key: string) => { try { sessionStorage.setItem(ACTED, key); } catch { /* storage blocked: MAX_POLLS ends it */ } };
/** A new job in the same tab (an application the board shows in its own page). */
export const resetActed = () => { try { sessionStorage.removeItem(ACTED); } catch { /* nothing to clear */ } };

export interface StepDeps {
  adapter: Pick<AtsAdapter, 'isFormPage' | 'stepKey' | 'extract'>;
  settings: LoopSettings;
  fill: () => Promise<Filled>;
  top: boolean;
  /** No form after a while: press the posting's own Apply button. */
  clickApply: boolean;
  /** The application is inside the board's page, among other jobs' buttons: only its own form's buttons count. */
  inPage: boolean;
  /** The form on screen opens the way applications do (name, email, phone…). */
  asksIdentity: () => boolean;
  /** This frame is a supported ATS, matched by its own https URL: the only place the saved loop login is typed. */
  signInHere: boolean;
}

/** One poll of the loop in this frame: sign in, or fill the step on screen and (if the applicant asked) press on. */
export async function loopStep(d: StepDeps, doc: Document = document): Promise<Step> {
  const did = await decide(d, doc);
  if (did) log(did, location.href);
  return did;
}

async function decide(d: StepDeps, doc: Document): Promise<Step> {
  const { adapter, settings: s } = d;
  const path = `${location.pathname}${location.search}`;
  // Inside a board, a form is the application only if it opens like one (or the loop is already past its first step):
  // the board's own search, filter and chat boxes are forms too.
  const isForm = adapter.isFormPage(doc) && (!d.inPage || !!acted() || d.asksIdentity());

  if (d.signInHere && s.email && s.password && [...doc.querySelectorAll('input[type="password"]')].some(visible)) {
    const key = `signin|${path}`;
    if (acted() === key) return 'waiting'; // one try per page: a wrong password must not lock the account
    if (signIn(doc, s.email, s.password)) { markActed(key); return 'progress'; }
  }

  if (!isForm) {
    // A page to confirm with no fields (Workday's Review), and only in a tab the loop has already stepped through.
    const key = `review|${path}`;
    const submit = s.submit && acted() && acted() !== key ? advanceButton(doc, FINAL) : undefined;
    if (submit) { log(`pressing "${label(submit)}" on a page with no fields`); markActed(key); submit.click(); return 'acted'; }
    const apply = d.clickApply && d.top ? applyTargets(doc)[0] : undefined;
    if (apply) { log(`no form yet; pressing the posting's "${label(apply)}"`); apply.click(); }
    return null;
  }

  const key = `form|${adapter.stepKey(doc)}`;
  if (acted() === key) return 'waiting';
  const filled = await d.fill();
  log('Auto-fill:', filled ?? 'profile not set up');
  if (filled === 'reloading') return 'progress';
  if (filled === 'nothing') return null; // a form, but not one Auto-fill has anything for: not an application
  if (filled === null) return 'stuck';
  if (!s.submit) return 'filled';
  if (filled !== 'clean') return 'stuck'; // never send an application with a question left open
  const own = adapter.extract(doc)[0]?.container.closest<HTMLElement>('form, [role="dialog"]');
  const next = (own && advanceButton(own)) ?? (d.inPage ? undefined : advanceButton(doc));
  if (!next) { log('no Next or Submit button found'); return 'stuck'; }
  log(`pressing "${label(next)}"`);
  markActed(key);
  next.click();
  return 'acted';
}
