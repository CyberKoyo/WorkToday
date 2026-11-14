import type { ExtractedField, FillResult } from './field';
import type { Profile, ProfileValue } from '../profile/profile';

export interface AtsAdapter {
  id: 'workday' | 'greenhouse' | 'icims' | 'oracle' | 'successfactors' | 'ashby' | 'generic';
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
  /** Click "Add" until there is one work/education group per profile entry. */
  ensureGroups(doc: Document, profile: Profile): Promise<void>;
}
