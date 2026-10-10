import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';
import { DEFAULT_API_BASE } from './src/api/apiBase';

export default defineConfig({
  manifest: ({ browser, mode }) => {
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    return {
      name: 'Job Application Filler',
      description: 'Auto-fill Workday, Greenhouse, iCIMS and Oracle job applications from your reviewed resume profile.',
      // activeTab + scripting: the toolbar button runs Auto-fill on sites not listed below, with no install-time host access.
      permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting'],
      action: { default_title: 'Auto-fill this job application' },
      host_permissions: [`${env.WXT_API_BASE || DEFAULT_API_BASE}/*`, 'https://generativelanguage.googleapis.com/*'],
      ...(browser === 'firefox'
        ? { browser_specific_settings: { gecko: { id: 'workday-filler@local' } } }
        : {}),
    };
  },
});
