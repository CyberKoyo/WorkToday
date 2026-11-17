import { MANUAL_ONLY } from '../gemini/parseResume';
import type { Profile } from '../profile/profile';

// Re-parsing a resume must not clobber answers the user typed by hand (work
// authorization, EEO questions, etc.) — Gemini never fills these in anyway.
export function keepManualAnswers(parsed: Profile, current: Omit<Profile, 'reviewed'>): Profile {
  const merged = { ...parsed };
  for (const k of MANUAL_ONLY) merged[k] = current[k];
  // Certifications are often not on the resume; one typed by hand (and its proof) must survive a re-parse.
  // A proof is stored under the name as typed, so a name both have keeps that spelling.
  const typed = new Map(current.certifications.map((c) => [c.name.toLowerCase(), c.name]));
  const parsedNames = new Set(parsed.certifications.map((c) => c.name.toLowerCase()));
  merged.certifications = [
    ...parsed.certifications.map((c) => ({ ...c, name: typed.get(c.name.toLowerCase()) ?? c.name })),
    ...current.certifications.filter((c) => !parsedNames.has(c.name.toLowerCase())),
  ];
  // Projects typed in by hand are on no resume; a parse that finds none must not wipe them.
  if (!parsed.projects.length) merged.projects = current.projects;
  return merged;
}
