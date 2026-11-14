import { startAuto } from '@/src/autofill/auto';

// Registered by the background for every site once the applicant allows it (optional <all_urls>), so in-house careers
// sites get the banner without the toolbar button.
export default defineUnlistedScript(() => { startAuto(); });
