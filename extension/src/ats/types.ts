import type { ExtractedField, FillResult } from './field';
import type { Profile, ProfileValue } from '../profile/profile';

export interface AtsAdapter {
  id: 'workday' | 'greenhouse' | 'icims' | 'oracle' | 'successfactors' | 'ashby' | 'adp' | 'adp-tax' | 'eightfold' | 'phenom' | 'lever' | 'tesla' | 'smartrecruiters' | 'dayforce';
  detect(url: URL): boolean;
  /** An application form with fields is on screen in this document. */
  isFormPage(doc: Document): boolean;
  /** Changes when the applicant moves to another step of the application. */
  stepKey(doc: Document): string;
  extract(doc: Document): ExtractedField[];
  /** `missed` collects values a multi-value field could not take (reported to the user by name). */
  fill(f: ExtractedField, value: ProfileValue, timeoutMs?: number, missed?: string[]): Promise<FillResult>;
  fillFile(f: ExtractedField, file: File): Promise<FillResult>;
  /** Uploading the resume reloads the page with the ATS's own parse of it (iCIMS), so it goes first and alone. */
  resumeReloadsPage?: boolean;
  /** The button that moves to the next step, never the final submit. Default: one named Next/Continue (`autofill/advance`). */
  nextButton?(doc: Document): HTMLElement | null;
  /** Brings up the form to fill before it is read (ADP's tax screening: opens the opt-out form). */
  prepare?(doc: Document): Promise<void>;
  /** Fills as soon as the page loads, without the Auto-fill press (ADP's tax screening: the applicant opts out by default). */
  autoStart?: boolean;
  /** On the site's create-account / sign-in step: fills it with the applicant's standard password and signs in (`onAttempt` fires before a sign-in is sent). Null once through it; otherwise what to tell the applicant. */
  account?(doc: Document, email: string, password: string, onAttempt: () => void): Promise<string | null>;
  /** The create-account / sign-in step is on screen. */
  accountPage?(doc: Document): boolean;
  /** Click "Add" until there is one work/education group per profile entry. */
  ensureGroups(doc: Document, profile: Profile): Promise<void>;
}
