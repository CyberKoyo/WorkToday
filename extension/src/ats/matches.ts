// Content-script match patterns per ATS. Plain data so the content script options stay statically readable.
export const MATCHES = {
  workday: ['*://*.myworkdayjobs.com/*', '*://*.myworkday.com/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();
