import { startManual } from '@/src/autofill/manual';

// Injected by the background on a toolbar click (activeTab), so it reaches sites the manifest does not list.
export default defineUnlistedScript(() => { startManual(); });
