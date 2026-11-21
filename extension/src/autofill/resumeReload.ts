import { marker } from './marker';

// Marks an upload that reloads the page (iCIMS), so the reloaded page fills itself and does not upload again.
// Two minutes: a reload that never came must not trigger a fill on some later visit.
export const { mark: markResumeReload, pending: resumeReloadPending, clear: clearResumeReload, loaded: resumeReloadLoaded } = marker('wf:resume-reload', 2 * 60_000);
