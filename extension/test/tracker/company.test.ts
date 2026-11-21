import { describe, it, expect } from 'vitest';
import { companyFromUrl } from '../../src/tracker/company';

describe('companyFromUrl', () => {
  it('never throws on a malformed escape', () => {
    expect(companyFromUrl('https://boards.greenhouse.io/embed/job_app?for=%25')).toBe('%');
    expect(() => companyFromUrl('https://jobs.lever.co/%E0%A4%A/apply')).not.toThrow();
    expect(companyFromUrl('https://evilgreenhouse.io/embed/job_app?for=Acme')).not.toBe('Acme');
  });
  it.each([
    ['https://cmegroup.wd1.myworkdayjobs.com/en-US/cme_careers/job/Chicago/Intern_35062-1/apply', 'Cmegroup'],
    ['https://wd5.myworkday.com/acme/d/inst/job.htmld', 'Acme'],
    ['https://wd1.myworkdaysite.com/recruiting/acme_corp/External/job/1', 'Acme Corp'],
    ['https://job-boards.greenhouse.io/stripe/jobs/123', 'Stripe'],
    ['https://boards.greenhouse.io/embed/job_app?for=ramp&token=1', 'Ramp'],
    ['https://jobs.lever.co/palantir/abc/apply', 'Palantir'],
    ['https://jobs.ashbyhq.com/openai/123/application', 'Openai'],
    ['https://jobs.smartrecruiters.com/Visa/7444/apply', 'Visa'],
    ['https://careers-acme.icims.com/jobs/1/job', 'Acme'],
    ['https://jobs.dayforcehcm.com/en-US/tenet/CANDIDATEPORTAL/jobs/1', 'Tenet'],
    ['https://www.tesla.com/careers/search/job/apply/1', 'Tesla'],
    ['https://careers.acme.co.uk/apply', 'Acme'],
    ['https://eofe.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1/apply', ''],
    ['not a url', ''],
  ])('%s → %s', (url, company) => expect(companyFromUrl(url)).toBe(company));
});
