import { marker } from './marker';
import { clean } from '../ats/field';
import type { AutofillReport } from './runAutofill';

// Set when Auto-fill pressed Next itself, so the step it lands on fills itself and the run goes on.
// A minute: a step the site refused to leave must not fill some later visit.
export const { mark: markAdvance, pending: advancePending, clear: clearAdvance, loaded: advanceLoaded } = marker('wf:auto-advance', 60_000);

/** Every field on the step was filled (or already was), with nothing left for the applicant. */
export const complete = (r: AutofillReport) =>
  // Values a field could not take are listed in r.missed; the ones that need the applicant are also in r.attention.
  !r.reloading && !r.attention.length && !r.answerError && r.filled + r.skipped > 0;

export const shown = (el: Element) => el.getClientRects().length > 0;

// Only these exact names move to the next step: "Submit", "Apply" or "Finish Later" can never match.
const NEXT = /^(next( step)?|continue|save (and|&) (continue|next))$/i;

const BUTTON = 'button,input[type="submit"],input[type="button"],[role="button"]';
const isNext = (b: HTMLElement) => NEXT.test(clean(b instanceof HTMLInputElement ? b.value : b.textContent));

/** The step's Next button, never the final submit. */
export function nextButton(doc: Document): HTMLElement | null {
  return [...doc.querySelectorAll<HTMLElement>(BUTTON)].find((b) => shown(b) && !(b as HTMLButtonElement).disabled && isNext(b)) ?? null;
}

/** The applicant's own press of Next: the step it lands on fills itself, as after Auto-fill's (never Submit: NEXT cannot match it). */
export function watchManualNext(doc: Document): void {
  doc.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // a page script's click() is not the applicant
    const b = (e.target as Element | null)?.closest?.<HTMLElement>(BUTTON);
    if (b && isNext(b)) void markAdvance();
  }, true);
}

// The account step is done by itself once per tab: a second wrong password could lock the applicant's account.
const ACCOUNT_KEY = 'wf:account-tried';
export function markAccountTried(): void {
  try { sessionStorage.setItem(ACCOUNT_KEY, '1'); } catch { /* storage blocked: the step just is not automatic */ }
}
export function accountTried(): boolean {
  try { return sessionStorage.getItem(ACCOUNT_KEY) === '1'; } catch { return true; }
}
