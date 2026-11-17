import { setNativeValue, waitFor } from '../fill/dom';

// Workday's Create Account / Sign In step, one account per employer (live Fiserv, 2026-11-17).
export const WA = {
  email: 'input[data-automation-id="email"]',
  password: 'input[data-automation-id="password"]',
  verify: 'input[data-automation-id="verifyPassword"]',
  // Some tenants add "I agree" to the Create Account form; not seen live, named as Workday names it elsewhere.
  agree: 'input[data-automation-id="createAccountCheckbox"]',
  // aria-hidden type=submit buttons, each under a role="button" overlay that takes the applicant's own click.
  createButton: '[data-automation-id="createAccountSubmitButton"]',
  signInButton: '[data-automation-id="signInSubmitButton"]',
  // Live Fiserv, after a refused sign-in: <div data-automation-id="errorMessage" role="alert">.
  error: '[data-automation-id="errorMessage"],[role="alert"]',
} as const;

const q = <T extends HTMLElement>(doc: Document, sel: string) => doc.querySelector<T>(sel);

export const accountPage = (doc: Document): 'create' | 'signin' | null =>
  (!q(doc, WA.password) ? null : q(doc, WA.verify) ? 'create' : 'signin');

// Sign In only. Live Fiserv: a scripted click on the overlay does nothing; one on the button itself submits.
function press(doc: Document, button: string): boolean {
  const b = q(doc, button);
  return !!b && (b.click(), true);
}

function type(doc: Document, sel: string, value: string) {
  const el = q<HTMLInputElement>(doc, sel);
  if (el) setNativeValue(el, value);
}

type Outcome = 'left' | 'error' | null;
/** Whether the step went away (signed in) or the site refused. */
const settled = (doc: Document, timeoutMs: number) =>
  waitFor<Outcome>(() => (!accountPage(doc) ? 'left' : clean(q(doc, WA.error)?.textContent) ? 'error' : null), timeoutMs);
const clean = (s: string | null | undefined) => (s ?? '').trim();

export const CREATE_MESSAGE = 'Email and password are in. Press Create Account yourself (Workday only takes a real click there), or Sign In if you already have an account here.';

/**
 * Create Account: types the email and the standard password and ticks "I agree"; the press is the applicant's
 * (live Bloomberg: a scripted click on that button or its overlay is ignored, a real one creates the account).
 * Sign In: types both and presses Sign In, once (`onAttempt` fires just before).
 * Returns what to tell the applicant; null when signed in and the application is open.
 */
export async function fillAccount(doc: Document, email: string, password: string, onAttempt: () => void = () => {}, timeoutMs = 8000): Promise<string | null> {
  if (accountPage(doc) === 'create') {
    type(doc, WA.email, email);
    type(doc, WA.password, password);
    type(doc, WA.verify, password);
    const agree = q<HTMLInputElement>(doc, WA.agree);
    if (agree && !agree.checked) agree.click();
    return CREATE_MESSAGE;
  }
  type(doc, WA.email, email);
  type(doc, WA.password, password);
  onAttempt();
  if (!press(doc, WA.signInButton)) return 'Could not find Sign In. Sign in yourself.';
  // One attempt only: repeated wrong passwords lock a Workday account.
  return (await settled(doc, timeoutMs)) === 'left' ? null : 'Workday did not accept your account password here. Sign in yourself.';
}
