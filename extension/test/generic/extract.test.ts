import { describe, it, expect } from 'vitest';
import { discoverFields, extractGeneric } from '../../src/generic/extract';
import { fillGeneric } from '../../src/generic/fill';
import { toDescriptor } from '../../src/ats/field';

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
  it('leaves out fields the applicant cannot see', () => {
    document.body.innerHTML = `<style>.gone{display:none}</style><form id=apply><label for=v1>First Name*</label><input id=v1><label for=v2>Email*</label><input id=v2>
      <div style="display:none"><label for=h1>Phone</label><input id=h1></div><div class=gone><label for=h2>Street Address</label><input id=h2></div>
      <div style="position:absolute;left:-9999px;opacity:0"><label for=h3>City</label><input id=h3></div>
      <div style="visibility:hidden;height:0;overflow:hidden"><label for=h4>Gender</label><select id=h4><option>Female</option></select></div>
      <fieldset style="opacity:0;width:1px;height:1px;overflow:hidden"><legend>Veteran status</legend><label><input type=radio name=vet value=a>Protected</label><label><input type=radio name=vet value=b>Not protected</label></fieldset>
      <div class=gone><label for=h7>Resume</label><input id=h7 type=file></div><div class=gone><label for=h8>A project you are proud of</label><textarea id=h8></textarea></div></form>`;
    expect(discoverFields(document.getElementById('apply')!).map((d) => d.label)).toEqual(['First Name', 'Email']);
  });
  it('leaves out fields clipped away while still "visible"', () => {
    document.body.innerHTML = `<form id=apply><label for=v1>First Name*</label><input id=v1>
      <div style="height:0;overflow:hidden"><div><label for=h1>Gender</label><select id=h1><option>Female</option></select></div></div>
      <div style="max-height:0px;overflow:hidden"><label for=h2>Ethnicity</label><input id=h2></div>
      <div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><label for=h3>Veteran status</label><input id=h3></div>
      <div style="clip-path:inset(50%)"><label for=h4>Disability</label><input id=h4></div>
      <div style="transform:scale(0)"><label for=h5>Street Address</label><input id=h5></div>
      <div style="overflow:hidden;height:40px"><label for=v2>Email*</label><input id=v2></div></form>`;
    expect(discoverFields(document.getElementById('apply')!).map((d) => d.label)).toEqual(['First Name', 'Email']);
  });
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
  it('an id with a backslash does not break the form', () => {
    document.body.innerHTML = '<form id="f"><div><label for="a\\b">Middle</label><input id="a\\b"></div><div><label for="z">Last</label><input id="z"></div></form>';
    expect(discoverFields(document.getElementById('f')!).map((x) => x.label)).toEqual(['Middle name', 'Last name']);
  });
  const twoGroups = (a = '', b = '') => `<form id="f"><div><span>Q1?</span><input type=radio name=a id=a1${a}><label for=a1>Yes</label><input type=radio name=a id=a2><label for=a2>No</label>`
    + `<span>Q2?</span><input type=radio name=b id=b1${b}><label for=b1>Yes</label><input type=radio name=b id=b2><label for=b2>No</label></div></form>`;
  it('groups sharing a container never answer for each other', async () => {
    document.body.innerHTML = twoGroups(' aria-label="Q1?"', ' aria-label="Q2?"');
    const [q1, q2] = extractGeneric(document.getElementById('f')!);
    expect([q1!.label, q2!.label]).toEqual(['Q1?', 'Q2?']);
    expect(await fillGeneric(q2!, 'No')).toBe('filled');
    expect([...document.querySelectorAll<HTMLInputElement>('input:checked')].map((r) => r.id)).toEqual(['b2']);
    expect(await fillGeneric(q1!, 'Yes')).toBe('filled');
    expect([...document.querySelectorAll<HTMLInputElement>('input:checked')].map((r) => r.id)).toEqual(['a1', 'b2']);
    expect(Object.keys(toDescriptor(q1!)).sort()).toEqual(['id', 'kind', 'label', 'options', 'required']);
  });
  it('checkbox groups sharing a container tick only their own boxes', async () => {
    document.body.innerHTML = twoGroups(' aria-label="Q1?"', ' aria-label="Q2?"').replace(/radio/g, 'checkbox');
    const [, q2] = extractGeneric(document.getElementById('f')!);
    expect(await fillGeneric(q2!, ['Yes', 'No'])).toBe('filled');
    expect([...document.querySelectorAll<HTMLInputElement>('input:checked')].map((r) => r.id)).toEqual(['b1', 'b2']);
  });
  it('a shared container lends neither group its text as a label', async () => {
    document.body.innerHTML = twoGroups();
    const fields = extractGeneric(document.getElementById('f')!);
    expect(fields.map((f) => f.label)).toEqual([]);
  });
  it('reads required from label classes, not only a star', () => {
    document.body.innerHTML = `<form id="f">
      <div><label for="a" class="row__label row__label--required">A</label><input id="a"></div>
      <div><label for="b" class="row__label"><span>B</span><span class="row__label--required-star"></span></label><input id="b"></div>
      <div><label for="c" class="row__label">C</label><input id="c"></div>
      <div role="radiogroup" aria-labelledby="q"><label id="q" class="lab lab--required">Q?</label>
        <input type="radio" name="q" id="q1" required><label for="q1">Yes</label><input type="radio" name="q" id="q2" required><label for="q2">No</label></div>
      <div role="radiogroup" aria-labelledby="r"><label id="r" class="lab">R?</label>
        <input type="radio" name="r" id="r1"><label for="r1">Yes</label><input type="radio" name="r" id="r2"><label for="r2">No</label></div>
      <div role="radiogroup" aria-label="S?"><input type="radio" name="s" id="s1" required><label for="s1">Yes</label><input type="radio" name="s" id="s2" required><label for="s2">No</label></div>
    </form>`;
    expect(extractGeneric(document.getElementById('f')!).map((x) => [x.label, x.required])).toEqual([
      ['A', true], ['B', true], ['C', false], ['Q?', true], ['R?', false], ['S?', true],
    ]);
  });
  it('skips controls hidden inline, disabled, and ruled out by the caller', () => {
    document.body.innerHTML = `<form id="f">
      <div><label for="a">A</label><input id="a"></div>
      <div><label for="h">Hidden</label><input id="h" style="display: none;"></div>
      <div><label for="w">Widget</label><a id="w" class="chrome" role="combobox"></a></div>
      <div><label for="s">Real</label><select id="s"></select></div>
      <div><label for="d">Disabled</label><select id="d" disabled></select></div></form>`;
    const f = document.getElementById('f')!;
    expect(discoverFields(f).map((d) => d.label)).toEqual(['A', 'Widget', 'Real']);
    expect(discoverFields(f, (el) => el.matches('.chrome')).map((d) => d.label)).toEqual(['A', 'Real']);
    expect(extractGeneric(f, { skip: (el) => el.matches('.chrome') }).map((d) => d.label)).toEqual(['A', 'Real']);
  });
  it('prefers the visible for= label over a screen-reader-only aria-labelledby duplicate', () => {
    document.body.innerHTML = `<form id="f"><label id="vis" for="u">Upload your resume</label><label id="dup" for="u" aria-hidden="true">My Computer</label>
      <input id="u" type="file" aria-labelledby="dup vis"></form>`;
    expect(extractGeneric(document.getElementById('f')!).map((x) => x.label)).toEqual(['Upload your resume']);
  });
});

describe('label flags', () => {
  it('drops a spelled-out flag, but keeps "required" when it is the question', () => {
    document.body.innerHTML = `<form id="f">
      <div><label for="a">Email <span class="sr-only">(required)</span></label><input id="a"></div>
      <div><label for="b">Phone (optional)</label><input id="b"></div>
      <div><label for="c">Is visa sponsorship required</label><input id="c"></div></form>`;
    expect(discoverFields(document.getElementById('f')!).map((x) => [x.label, x.required])).toEqual([
      ['Email', true], ['Phone', false], ['Is visa sponsorship required', false]]);
  });
});
