import { describe, it, expect } from 'vitest';
import { generic, applicationRoot } from '../../src/generic/adapter';

const SEARCH = `<header><form id="site-search" role="search"><input type="text" aria-label="Search jobs"><button>Go</button></form></header>`;
const LOGIN = `<form id="sign-in"><label>Email <input type="email"></label><label>Password <input type="password"></label></form>`;
const APPLY = `
  <h1>Apply: Software Engineer</h1>
  <form id="apply">
    <label for="fn">First name *</label><input id="fn">
    <label for="em">Email</label><input id="em" type="email">
    <label for="cv">Resume</label><input id="cv" type="file">
  </form>`;

const labels = () => generic.extract(document).map((f) => [f.label, f.kind]);

describe('generic adapter', () => {
  it('is never picked by URL', () => {
    expect(generic.detect(new URL('https://www.amazon.jobs/en/applicant'))).toBe(false);
  });

  it('extracts the application form, not the search or sign-in forms beside it', () => {
    document.body.innerHTML = SEARCH + LOGIN + APPLY;
    expect((applicationRoot(document) as HTMLElement).id).toBe('apply');
    expect(labels()).toEqual([['First name', 'text'], ['Email', 'text'], ['Resume', 'file']]);
    expect(generic.extract(document)[0]!.required).toBe(true);
  });

  it('leaves out a newsletter form when the application form holds most fields', () => {
    document.body.innerHTML = `${APPLY}<footer><form id="news"><label>Email <input type="email"></label></form></footer>`;
    expect((applicationRoot(document) as HTMLElement).id).toBe('apply');
    expect(labels()).toHaveLength(3);
  });

  it('reads the whole page when fields are not in a form, still skipping sign-in', () => {
    document.body.innerHTML = `${LOGIN}<div id="app"><label for="a">Last name</label><input id="a"><label for="b">Phone</label><input id="b" type="tel"></div>`;
    expect(applicationRoot(document)).toBe(document.body);
    expect(labels()).toEqual([['Last name', 'text'], ['Phone', 'text']]);
  });

  it('sees no form on a page with only a search box', () => {
    document.body.innerHTML = SEARCH;
    expect(generic.isFormPage(document)).toBe(false);
    document.body.innerHTML = SEARCH + APPLY;
    expect(generic.isFormPage(document)).toBe(true);
  });

  it('step key follows the heading', () => {
    document.body.innerHTML = APPLY;
    const first = generic.stepKey(document);
    document.body.innerHTML = `<form id="apply"><h2>Voluntary questions</h2><label for="g">Gender</label><select id="g"><option></option></select><label for="v">Veteran</label><input id="v"></form>`;
    expect(generic.stepKey(document)).not.toBe(first);
  });
});
