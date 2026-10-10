import { mountBanner } from '@/src/autofill/mount';
import { pickAdapter } from '@/src/ats/registry';
import { CONTENT_MATCHES } from '@/src/ats/matches';

export default defineContentScript({
  matches: CONTENT_MATCHES,
  allFrames: true, // iCIMS and embedded Greenhouse forms live in iframes
  main() {
    const adapter = pickAdapter(new URL(location.href));
    if (adapter) mountBanner(adapter);
  },
});
