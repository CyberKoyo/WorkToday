import { describe, it, expect } from 'vitest';
import { discoverFields, extractGeneric } from '../../src/generic/extract';

const FORM = `<form id="f">
  <h2>Contact</h2>
  <div><label for="fn">First Name <span>*</span></label><input id="fn" type="text"></div>
  <div><label>Email <input type="email" name="email"></label></div>
  <table><tr><td><label for="ph">Phone</label></td><td><input id="ph" type="tel" required></td></tr></table>
  <div><label for="pw">Password</label><input id="pw" type="password"></div>
  <div><label for="q">Search jobs</label><input id="q" type="search"></div>
  <div aria-hidden="true"><label for="h">Hidden</label><input id="h"></div>
  <input type="hidden" name="token" value="x">
  <div><label for="st">State</label><select id="st"><option value="">Select</option><option value="CA">California</option></select></div>
  <div><span id="deg-l">Degree</span><div role="combobox" aria-labelledby="deg-l"><input></div></div>
  <fieldset><legend>Authorized to work?</legend><input type="radio" name="auth" id="ay"><label for="ay">Yes</label><input type="radio" name="auth" id="an"><label for="an">No</label></fieldset>
  <fieldset><legend>Countries</legend><input type="checkbox" name="c" id="c1"><label for="c1">Canada</label><input type="checkbox" name="c" id="c2"><label for="c2">Mexico</label></fieldset>
  <div><input type="checkbox" id="cur"><label for="cur">I currently work here</label></div>
  <div><label for="cv">Resume</label><input id="cv" type="file"></div>
  <div role="radiogroup" aria-label="Relocate?"><div role="radio" aria-checked="false">Yes</div><div role="radio" aria-checked="false">No</div></div>
  <h2>Work Experience</h2>
  <div><label for="t1">Job Title</label><input id="t1"></div>
  <div><label for="t2">Job Title</label><input id="t2"></div>
  <div><label for="d">Start</label><input id="d" type="date"></div>
  <div><label for="w">Why us?</label><textarea id="w"></textarea></div>
</form>`;

describe('extractGeneric', () => {
  it('finds labelled controls, kinds, sections, groups', () => {
    document.body.innerHTML = FORM;
    const f = extractGeneric(document.getElementById('f')!);
    expect(f.map((x) => [x.label, x.kind, x.required, x.section, x.groupIndex])).toEqual([
      ['First Name', 'text', true, 'Contact', 0],
      ['Email', 'text', false, 'Contact', 0],
      ['Phone', 'text', true, 'Contact', 0],
      ['State', 'select', false, 'Contact', 0],
      ['Degree', 'select', false, 'Contact', 0],
      ['Authorized to work?', 'radio', false, 'Contact', 0],
      ['Countries', 'checkbox', false, 'Contact', 0],
      ['I currently work here', 'checkbox', false, 'Contact', 0],
      ['Resume', 'file', false, 'Contact', 0],
      ['Relocate?', 'radio', false, 'Contact', 0],
      ['Job Title', 'text', false, 'Work Experience', 0],
      ['Job Title', 'text', false, 'Work Experience', 1],
      ['Start', 'date', false, 'Work Experience', 0],
      ['Why us?', 'textarea', false, 'Work Experience', 0],
    ]);
    expect(f[5]!.options).toEqual(['Yes', 'No']);
    expect(f[6]!.options).toEqual(['Canada', 'Mexico']);
    expect(f[7]!.options).toBeUndefined();
    expect(f[9]!.options).toEqual(['Yes', 'No']);
  });
  it('container holds only its own control', () => {
    document.body.innerHTML = FORM;
    const f = extractGeneric(document.getElementById('f')!);
    expect(f[2]!.container.tagName).toBe('TR');
    expect(f[0]!.container.querySelectorAll('input').length).toBe(1);
    expect(f[0]!.container.dataset.wfId).toBe('wf-0');
  });
  it('numbered sections set groupIndex; custom sectionOf wins', () => {
    document.body.innerHTML = '<form id="f"><div class="g"><label for="a">School</label><input id="a"></div><div class="g"><label for="b">School</label><input id="b"></div></form>';
    const groups = [...document.querySelectorAll<HTMLElement>('.g')];
    const f = extractGeneric(document.getElementById('f')!, { sectionOf: (c) => `Education ${groups.indexOf(c.closest('.g')!) + 1}` });
    expect(f.map((x) => [x.section, x.groupIndex])).toEqual([['Education 1', 0], ['Education 2', 1]]);
  });
  it('discoverFields is pure and skips label-less controls', () => {
    document.body.innerHTML = '<form id="f"><input id="x"><div><label for="y">Y</label><input id="y"></div></form>';
    expect(discoverFields(document.getElementById('f')!).map((d) => d.label)).toEqual(['Y']);
    expect(document.querySelector('[data-wf-id]')).toBeNull();
  });
  it('never shares a container between fields', () => {
    for (const html of [
      '<div id="f"><label for="a">A</label><input id="a"><label for="b">B</label><input id="b"></div>',
      '<form id="f"><input placeholder="Email"><input placeholder="Phone"></form>',
    ]) {
      document.body.innerHTML = html;
      const f = extractGeneric(document.getElementById('f')!);
      expect(f).toHaveLength(2);
      expect(f[0]!.container).not.toBe(f[1]!.container);
      for (const x of f) expect(x.container.matches('input') || x.container.querySelectorAll('input').length === 1).toBe(true);
      expect(document.querySelectorAll('[data-wf-id]')).toHaveLength(2);
    }
  });
  it('wrapped select label excludes option text', () => {
    document.body.innerHTML = '<form id="f"><label>State <select><option>Select</option><option>California</option></select></label></form>';
    expect(discoverFields(document.getElementById('f')!).map((d) => d.label)).toEqual(['State']);
  });
  it('radio group with a plain label question is kept', () => {
    document.body.innerHTML = '<form id="f"><div class="field"><label>Authorized?</label><label><input type="radio" name="a">Yes</label><label><input type="radio" name="a">No</label></div></form>';
    const d = discoverFields(document.getElementById('f')!);
    expect(d.map((x) => [x.label, x.options])).toEqual([['Authorized?', ['Yes', 'No']]]);
  });
});
