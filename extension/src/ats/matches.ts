// Content-script match patterns per ATS. Plain data so the content script options stay statically readable.
export const MATCHES = {
  workday: ['*://*.myworkdayjobs.com/*', '*://*.myworkday.com/*'],
  greenhouse: ['*://*.greenhouse.io/*'],
} as const;

export const CONTENT_MATCHES: string[] = Object.values(MATCHES).flat();
