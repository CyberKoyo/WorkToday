import { MANUAL_ONLY } from '../gemini/parseResume';
import type { Profile } from '../profile/profile';

// Re-parsing a resume must not clobber answers the user typed by hand (work
// authorization, EEO questions, etc.) — Gemini never fills these in anyway.
export function keepManualAnswers(parsed: Profile, current: Omit<Profile, 'reviewed'>): Profile {
  const merged = { ...parsed };
  for (const k of MANUAL_ONLY) merged[k] = current[k];
  return merged;
}
