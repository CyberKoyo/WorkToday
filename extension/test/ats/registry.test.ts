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
  it('picks Oracle Recruiting Cloud', () => {
    expect(pickAdapter(new URL('https://abcd.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1/apply/email'))?.id).toBe('oracle');
    expect(CONTENT_MATCHES).toContain('*://*.oraclecloud.com/hcmUI/CandidateExperience/*');
  });
  it('picks SAP SuccessFactors', () => {
    expect(pickAdapter(new URL('https://career2.successfactors.eu/career?company=Ericsson&career_ns=job_application'))?.id).toBe('successfactors');
    expect(CONTENT_MATCHES).toContain('*://*.successfactors.eu/career*');
    expect(CONTENT_MATCHES).toContain('*://*.successfactors.com/career*');
  });
  it('picks Ashby', () => {
    expect(pickAdapter(new URL('https://jobs.ashbyhq.com/openai/240d459b-696d-43eb-8497-fab3e56ecd9b/application'))?.id).toBe('ashby');
    expect(CONTENT_MATCHES).toContain('*://jobs.ashbyhq.com/*');
  });
});
