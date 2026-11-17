// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lever } from '../../src/lever/adapter';
import { pickAdapter } from '../../src/ats/registry';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-lever-apply.html`, 'utf8'); };
const byLabel = (re: RegExp) => lever.extract(document).find((f) => re.test(f.label))!;

describe('lever adapter (live CesiumAstro apply page)', () => {
  it('is picked on jobs.lever.co', () => {
    expect(pickAdapter(new URL('https://jobs.lever.co/acme/d406d2ed/apply'))?.id).toBe('lever');
  });
  it('reads one field per question, card questions included', () => {
    load();
    expect(lever.isFormPage(document)).toBe(true);
    const fields = lever.extract(document);
    expect(fields.slice(0, 7).map((f) => [f.label, f.kind, f.required])).toEqual([
      ['Resume/CV', 'file', true], ['Full name', 'text', true], ['Email', 'text', true], ['Phone', 'text', true],
      ['Current location', 'text', true], ['Current company', 'text', false], ['LinkedIn URL', 'text', false],
    ]);
    expect(fields[0]!.profileKey).toBe('resumeFile');
    expect(fields[4]!.profileKey).toBe('city');
    const gpa = byLabel(/overall GPA/);
    expect([gpa.kind, gpa.required, gpa.section]).toEqual(['select', true, 'Internship Questions']);
    const sponsor = byLabel(/require sponsorship/);
    expect([sponsor.kind, sponsor.options]).toEqual(['radio', ['Yes', 'No']]);
    expect(byLabel(/^Race$/).options![0]).toBe('Hispanic or Latino'); // without the description under it
    expect(byLabel(/^Yes, I have read the Applicant Authorization/).kind).toBe('checkbox');
    // The signature boxes stay out until the disability answer shows them.
    expect(fields.some((f) => f.label === 'Date')).toBe(false);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
  });
  it('fills a card dropdown and a radio', async () => {
    load();
    expect(await lever.fill(byLabel(/academic year/), 'Junior')).toBe('filled');
    expect(byLabel(/academic year/).container.querySelector('select')!.value).toBe('Junior');
    const sponsor = byLabel(/require sponsorship/);
    expect(await lever.fill(sponsor, false)).toBe('filled');
    expect((sponsor.members![1] as HTMLInputElement).checked).toBe(true);
  });
  it('searches the location and takes the result in the applicant\'s state', async () => {
    load();
    const loc = byLabel(/Current location/);
    const input = loc.container.querySelector<HTMLInputElement>('input.location-input')!;
    const list = loc.container.querySelector('.dropdown-results')!;
    input.addEventListener('keydown', () => {
      list.innerHTML = '<div class="dropdown-location" id="location-0">Springfield, IL, USA</div><div class="dropdown-location" id="location-1">Springfield, MA, USA</div>';
    });
    let picked = '';
    document.addEventListener('mousedown', (e) => { picked = (e.target as HTMLElement).id; });
    const changed: string[] = [];
    document.addEventListener('change', (e) => { changed.push((e.target as HTMLInputElement).name); });
    loc.tieBreak = 'MA';
    expect(await lever.fill(loc, 'Springfield')).toBe('filled');
    expect(picked).toBe('location-1');
    expect(changed).toEqual(['location', 'selectedLocation']); // or the site's resume parse wipes the choice
  });
  it('gives the location back empty when the search finds nothing', async () => {
    load();
    const loc = byLabel(/Current location/);
    let blurred = false;
    loc.container.querySelector('input.location-input')!.addEventListener('blur', () => { blurred = true; });
    expect(await lever.fill(loc, 'Nowhere', 50)).toBe('no_match');
    expect(blurred).toBe(true);
  }, 10000);
});
