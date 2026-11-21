import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../../src/ats/registry';
import { CONTENT_MATCHES } from '../../src/ats/matches';

describe('pickAdapter', () => {
  it('picks by host', () => {
    expect(pickAdapter(new URL('https://acme.wd1.myworkdayjobs.com/x'))?.id).toBe('workday');
    expect(pickAdapter(new URL('https://example.com/'))).toBeNull();
  });
  it('never over cleartext http, where a network attacker writes the page', () => {
    expect(pickAdapter(new URL('http://acme.wd1.myworkdayjobs.com/x'))).toBeNull();
    expect(CONTENT_MATCHES.every((m) => m.startsWith('https://'))).toBe(true);
  });
  it('content script covers every adapter host', () => {
    expect(CONTENT_MATCHES).toContain('https://*.myworkdayjobs.com/*');
    expect(CONTENT_MATCHES).toContain('https://*.myworkday.com/*');
    expect(CONTENT_MATCHES).toContain('https://*.myworkdaysite.com/*');
  });
  it('picks Greenhouse', () => {
    expect(pickAdapter(new URL('https://job-boards.greenhouse.io/acme/jobs/1'))?.id).toBe('greenhouse');
    expect(CONTENT_MATCHES).toContain('https://*.greenhouse.io/*');
  });
  it('picks iCIMS', () => {
    expect(pickAdapter(new URL('https://careers-acme.icims.com/jobs/1/x/candidate'))?.id).toBe('icims');
    expect(CONTENT_MATCHES).toContain('https://*.icims.com/*');
  });
  it('picks Oracle Recruiting Cloud', () => {
    expect(pickAdapter(new URL('https://abcd.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1/apply/email'))?.id).toBe('oracle');
    expect(CONTENT_MATCHES).toContain('https://*.oraclecloud.com/hcmUI/CandidateExperience/*');
  });
  it('picks SAP SuccessFactors', () => {
    expect(pickAdapter(new URL('https://career2.successfactors.eu/career?company=Ericsson&career_ns=job_application'))?.id).toBe('successfactors');
    expect(CONTENT_MATCHES).toContain('https://*.successfactors.eu/career*');
    expect(CONTENT_MATCHES).toContain('https://*.successfactors.com/career*');
  });
  it('picks Ashby', () => {
    expect(pickAdapter(new URL('https://jobs.ashbyhq.com/openai/240d459b-696d-43eb-8497-fab3e56ecd9b/application'))?.id).toBe('ashby');
    expect(CONTENT_MATCHES).toContain('https://jobs.ashbyhq.com/*');
  });
  it('picks ADP Recruiting Management', () => {
    expect(pickAdapter(new URL('https://recruiting.adp.com/srccar/public/nghome.guid?ncsp=acme&r=5001234342900'))?.id).toBe('adp');
    expect(CONTENT_MATCHES).toContain('https://recruiting.adp.com/*');
  });
  it('picks Eightfold, on its own host or a company domain', () => {
    expect(pickAdapter(new URL('https://stmicroelectronics.eightfold.ai/careers/apply?pid=563637173607734'))?.id).toBe('eightfold');
    expect(pickAdapter(new URL('https://careers.qualcomm.com/careers/apply?pid=446720740529'))?.id).toBe('eightfold');
    expect(CONTENT_MATCHES).toContain('https://*.eightfold.ai/careers*');
  });
  it('picks Phenom apply on a company domain', () => {
    expect(pickAdapter(new URL('https://careers.steris.com/us/en/apply?jobSeqNo=SCZSCCUS56672EXTERNALENUS&step=1&stepname=personalInformation'))?.id).toBe('phenom');
    expect(pickAdapter(new URL('https://careers.steris.com/us/en/job/56672/Software-Engineering-Intern'))).toBeNull();
    expect(CONTENT_MATCHES).toContain('https://careers.steris.com/*/apply*');
  });
});
