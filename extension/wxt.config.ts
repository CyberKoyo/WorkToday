import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';
import { resolve } from 'node:path';
import { DEFAULT_API_BASE } from './src/api/apiBase';

export default defineConfig({
  manifest: ({ browser, mode }) => {
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    return {
      name: 'Job Application Filler',
      description: 'Auto-fill job applications from your reviewed resume profile and keep a log of where you applied.',
      // activeTab + scripting: the toolbar button runs Auto-fill on sites not listed below, with no install-time host access.
      // identity + the Sheets host only in builds with a Google client ID (application tracking to Google Sheets).
      permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting', ...(env.WXT_GOOGLE_CLIENT_ID ? ['identity'] : [])],
      action: { default_title: 'Auto-fill this job application' },
      host_permissions: [`${env.WXT_API_BASE || DEFAULT_API_BASE}/*`, 'https://generativelanguage.googleapis.com/*',
        ...(env.WXT_GOOGLE_CLIENT_ID ? ['https://sheets.googleapis.com/*'] : [])],
      // The job loop fills whatever site a board's Apply button opens. Optional: granted from the dashboard, not at install.
      ...(browser === 'firefox'
        ? {
          optional_permissions: ['<all_urls>'],
          browser_specific_settings: { gecko: {
            id: 'workday-filler@local',
            strict_min_version: '140.0', // first version that reads data_collection_permissions
            // What leaves the browser (README, Privacy): the resume and profile go to Gemini; form labels go to the
            // mapping server, and job page text to Gemini for essay drafts and unlisted job locations. Sheets builds also send each application's link.
            data_collection_permissions: {
              required: ['personallyIdentifyingInfo', 'websiteContent', ...(env.WXT_GOOGLE_CLIENT_ID ? ['browsingActivity'] : [])],
            },
          },
          gecko_android: { strict_min_version: '142.0' } }, // Android reads data_collection_permissions from 142
        }
        : { optional_host_permissions: ['<all_urls>'] }),
    };
  },
  // AMO rebuilds from these sources: the extension imports ../shared, so the zip starts at the repo root.
  zip: {
    sourcesRoot: resolve(process.cwd(), '..'), // absolute: WXT reads a relative root's files from the wrong folder
    includeSources: ['package.json', 'package-lock.json', 'README.md', 'shared/**', 'server/**', 'extension/**', 'store/PRIVACY.md'],
    excludeSources: ['**/test/**'],
  },
});
