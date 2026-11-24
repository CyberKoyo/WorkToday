import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  // The live-capture tests parse whole saved pages and take ~5s when the suite runs in parallel (with the vault's PBKDF2).
  test: { environment: 'happy-dom', testTimeout: 20_000 },
});
