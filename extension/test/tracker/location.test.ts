import { describe, it, expect, vi } from 'vitest';
import { jobLocation, locationInDoc } from '../../src/tracker/location';

// Shapes trimmed from live postings, Nov 2026 (one per ATS).
const page = (...scripts: string[]) => new DOMParser().parseFromString(`<html><head>${scripts.join('')}</head><body></body></html>`, 'text/html');
const ld = (json: unknown) => `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
const posting = (jobLocation: unknown, more = {}) => ({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Intern', jobLocation, ...more });
const blank = page();

/** A fetch that answers each address from `routes` (404 otherwise). */
function routes(map: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const body = map[String(url)];
    if (body === undefined) return new Response('', { status: 404 });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('locationInDoc', () => {
  it.each([
    ['Workday', posting({ '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'United States of America', addressLocality: 'Chicago - 20 S. Wacker' } }),
      'Chicago - 20 S. Wacker, United States of America'],
    ['Eightfold (country object, region repeating it)', posting({ '@type': 'Place', address: { addressCountry: { '@type': 'Country', name: 'US' }, addressLocality: 'Santa Clara', addressRegion: 'CA,US' } }),
      'Santa Clara, CA, US'],
    ['iCIMS (several, with placeholders)', posting([
      { '@type': 'Place', address: { addressCountry: 'US', streetAddress: '222 North LaSalle Street', addressLocality: 'Chicago', addressRegion: 'IL', postOfficeBoxNumber: 'UNAVAILABLE' } },
      { '@type': 'Place', address: { addressCountry: 'US', streetAddress: 'UNAVAILABLE', addressLocality: 'Atlanta', addressRegion: 'UNAVAILABLE' } }]),
      'Chicago, IL, US; Atlanta, US'],
    ['remote', posting({ '@type': 'Place', address: { addressLocality: 'Austin', addressRegion: 'TX' } }, { jobLocationType: 'TELECOMMUTE' }), 'Austin, TX; Remote'],
    ['@graph', { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, posting({ address: { addressLocality: 'Boston' } })] }, 'Boston'],
  ])('reads a JobPosting: %s', (_, json, want) => {
    expect(locationInDoc(page(ld({ '@type': 'BreadcrumbList' }), ld(json)))).toBe(want);
  });

  it('skips broken JSON and pages without a posting', () => {
    expect(locationInDoc(page('<script type="application/ld+json">{oops</script>', ld({ '@type': 'WebPage' })))).toBe('');
  });

  it("reads Phenom's apply page, whose JobPosting is only on the job page", () => {
    const ddo = { response: { response: { jobData: { title: 'Intern' }, jobLocation: 'Long Island City, New York, United States of America' } } };
    expect(locationInDoc(page(ld({ '@type': 'WebPage' }), `<script>var phApp = phApp || {}; phApp.ddo = ${JSON.stringify(ddo)}; phApp.x = 1;</script>`)))
      .toBe('Long Island City, New York, United States of America');
  });
});

describe('jobLocation', () => {
  it('Workday: its job API, from the apply address (extra locations and remote type too)', async () => {
    const f = routes({ 'https://cmegroup.wd1.myworkdayjobs.com/wday/cxs/cmegroup/cme_careers/job/Chicago/Intern_35062-1':
      { jobPostingInfo: { location: 'Chicago - 20 S. Wacker', additionalLocations: ['New York - 1 Liberty'], remoteType: 'Hybrid' } } });
    expect(await jobLocation(blank, 'https://cmegroup.wd1.myworkdayjobs.com/en-US/cme_careers/job/Chicago/Intern_35062-1/apply/applyManually?step=2', f))
      .toBe('Chicago - 20 S. Wacker; New York - 1 Liberty; Hybrid');
  });

  it('Greenhouse: the board API, embedded or hosted', async () => {
    const f = routes({ 'https://boards-api.greenhouse.io/v1/boards/discord/jobs/8945798002': { location: { name: 'Los Angeles Metropolitan Area or New York City Metropolitan Area' } } });
    for (const url of ['https://boards.greenhouse.io/embed/job_app?for=discord&token=8945798002', 'https://job-boards.greenhouse.io/discord/jobs/8945798002']) {
      expect(await jobLocation(blank, url, f)).toBe('Los Angeles Metropolitan Area or New York City Metropolitan Area');
    }
  });

  it("SmartRecruiters: the postings API, by id or by the one-click form's uuid", async () => {
    const loc = { location: { city: 'Aguascalientes', region: 'Ags.', country: 'mx', fullLocation: 'Aguascalientes, Ags., Mexico', remote: false, hybrid: true } };
    const f = routes({
      'https://api.smartrecruiters.com/v1/companies/BoschGroup/postings/744000163317501': loc,
      'https://api.smartrecruiters.com/v1/companies/BoschGroup/postings/489e2c31-8641-400e-9b0e-491531d3c0ec': loc,
    });
    expect(await jobLocation(blank, 'https://jobs.smartrecruiters.com/BoschGroup/744000163317501-engineer', f)).toBe('Aguascalientes, Ags., Mexico; Hybrid');
    expect(await jobLocation(blank, 'https://jobs.smartrecruiters.com/oneclick-ui/company/BoschGroup/publication/489e2c31-8641-400e-9b0e-491531d3c0ec', f))
      .toBe('Aguascalientes, Ags., Mexico; Hybrid');
  });

  it('Oracle: the requisition details API', async () => {
    const f = routes({ 'https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22210699819%22,siteNumber=CX_1001':
      { items: [{ PrimaryLocation: 'Lake Zurich, IL, United States', secondaryLocations: [{ Name: 'Winnetka, IL, United States' }], WorkplaceType: '' }] } });
    expect(await jobLocation(blank, 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210699819/apply/section/1', f))
      .toBe('Lake Zurich, IL, United States; Winnetka, IL, United States');
  });

  it("Dayforce: the site's job board id, then the posting", async () => {
    const f = routes({
      'https://jobs.dayforcehcm.com/api/geo/lwcc/sitecontext/lwcc/CANDIDATEPORTAL/en-US': { jobBoardId: 1 },
      'https://jobs.dayforcehcm.com/api/geo/lwcc/jobposting/lwcc/en-US/1/595': { hasVirtualLocation: true,
        postingLocations: [{ cityName: 'Baton Rouge', stateCode: 'LA', formattedAddress: '2237 S. Acadian Thruway, Baton Rouge, LA' }] },
    });
    expect(await jobLocation(blank, 'https://jobs.dayforcehcm.com/en-US/lwcc/CANDIDATEPORTAL/jobs/595/apply/manualApplication', f)).toBe('Baton Rouge, LA; Remote');
  });

  it('ADP Workforce Now: the requisition API', async () => {
    const f = routes({ 'https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions/579414?cid=4368bc58&lang=en_US':
      { requisitionLocations: [{ address: { cityName: 'Burlington' }, nameCode: { shortName: ' Burlington, MA, US' } }] } });
    expect(await jobLocation(blank, 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=4368bc58&jobId=579414', f)).toBe('Burlington, MA, US');
  });

  it('the page itself when it has no API (Ashby, Eightfold, JazzHR apply pages)', async () => {
    const here = page(ld(posting({ address: { addressLocality: 'San Francisco', addressRegion: 'California', addressCountry: 'United States' } })));
    expect(await jobLocation(here, 'https://jobs.ashbyhq.com/openai/8fb1615c/application', routes({}))).toBe('San Francisco, California, United States');
  });

  it('the posting page behind the form: Lever /apply, iCIMS /candidate', async () => {
    const lever = page(ld(posting({ address: { addressLocality: 'Singapore, Singapore' } }))).documentElement.outerHTML;
    const icims = page(ld(posting([{ address: { addressLocality: 'Chicago', addressRegion: 'IL' } }]))).documentElement.outerHTML;
    const f = routes({ 'https://jobs.lever.co/palantir/6ed76ce8': lever, 'https://careers-origamirisk.icims.com/jobs/4787/sales/job?in_iframe=1': icims });
    expect(await jobLocation(blank, 'https://jobs.lever.co/palantir/6ed76ce8/apply', f)).toBe('Singapore');
    expect(await jobLocation(blank, 'https://careers-origamirisk.icims.com/jobs/4787/sales/candidate?in_iframe=1', f)).toBe('Chicago, IL');
  });

  it('a site that is down or changed gives the next source, then nothing; never throws', async () => {
    const down = vi.fn(async () => { throw new TypeError('NetworkError'); }) as unknown as typeof fetch;
    const here = page(ld(posting({ address: { addressLocality: 'Chicago' } })));
    expect(await jobLocation(here, 'https://cmegroup.wd1.myworkdayjobs.com/en-US/cme_careers/job/Chicago/Intern_1/apply', down)).toBe('Chicago');
    expect(await jobLocation(blank, 'https://jobs.lever.co/palantir/6ed76ce8/apply', down)).toBe('');
    expect(await jobLocation(blank, 'https://jobs.dayforcehcm.com/en-US/lwcc/CANDIDATEPORTAL/jobs/595', routes({}))).toBe('');
    expect(await jobLocation(blank, 'not a url', down)).toBe('');
    expect(await jobLocation(blank, 'https://acme.com/careers', routes({}))).toBe(''); // no API, no posting address to try
  });
});
