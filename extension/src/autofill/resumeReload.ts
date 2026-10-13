// Marks an upload that reloads the page (iCIMS), so the reloaded page fills itself and does not upload again.
const KEY = 'wf:resume-reload';
const FRESH_MS = 2 * 60_000; // a reload that never came must not trigger a fill on some later visit

export function markResumeReload(): void {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked: the applicant clicks again */ }
}

export function resumeReloadPending(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < FRESH_MS; } catch { return false; }
}

export function clearResumeReload(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
