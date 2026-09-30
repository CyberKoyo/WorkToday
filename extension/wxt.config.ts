import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';

export default defineConfig({
  manifest: ({ browser, mode }) => {
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    return {
      name: 'Workday Filler',
      description: 'Auto-fill Workday job applications from your reviewed resume profile.',
      permissions: ['storage', 'unlimitedStorage'],
      host_permissions: [`${env.WXT_API_BASE}/*`, 'https://generativelanguage.googleapis.com/*'],
      ...(browser === 'firefox'
        ? { browser_specific_settings: { gecko: { id: 'workday-filler@local' } } }
        : {}),
    };
  },
});
