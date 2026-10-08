import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../../src/ats/registry';
import { CONTENT_MATCHES } from '../../src/ats/matches';

describe('pickAdapter', () => {
  it('picks by host', () => {
    expect(pickAdapter(new URL('https://acme.wd1.myworkdayjobs.com/x'))?.id).toBe('workday');
    expect(pickAdapter(new URL('https://example.com/'))).toBeNull();
  });
  it('content script covers every adapter host', () => {
    expect(CONTENT_MATCHES).toContain('*://*.myworkdayjobs.com/*');
    expect(CONTENT_MATCHES).toContain('*://*.myworkday.com/*');
  });
  it('picks Greenhouse', () => {
    expect(pickAdapter(new URL('https://job-boards.greenhouse.io/acme/jobs/1'))?.id).toBe('greenhouse');
    expect(CONTENT_MATCHES).toContain('*://*.greenhouse.io/*');
  });
  it('picks iCIMS', () => {
    expect(pickAdapter(new URL('https://careers-acme.icims.com/jobs/1/x/candidate'))?.id).toBe('icims');
    expect(CONTENT_MATCHES).toContain('*://*.icims.com/*');
  });
});
