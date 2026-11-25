import { describe, it, expect, beforeEach } from 'vitest';
import { fillField } from '../../src/fill/fillField';
import { extractFields } from '../../src/workday/extractFields';

// Mimics live NVIDIA's "How Did You Hear About Us?" (2026-11-24): top-level rows are categories (side charm) that open
// a sublist when their label is clicked; search finds only leaves, and a search with no leaf shows the top level again.
type Tree = Record<string, string[]>;
const at = (url: string) => (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);

function nested(tree: Tree) {
  document.body.innerHTML = `<div data-automation-id="formField-source"><label>How Did You Hear About Us?</label>
    <div data-automation-id="multiSelectContainer"><input type="text" placeholder="Search">
    <ul role="listbox" data-automation-id="selectedItemList"></ul></div></div>`;
  const f = extractFields()[0]!;
  const input = f.container.querySelector('input')!;
  const chipList = f.container.querySelector('[data-automation-id="selectedItemList"]')!;
  let list: HTMLElement | undefined;
  const row = (name: string, category: boolean, n: number) => {
    const o = document.createElement('div');
    o.setAttribute('role', 'option'); o.setAttribute('data-automation-id', 'menuItem'); o.setAttribute('aria-setsize', String(n));
    o.innerHTML = `<div data-automation-id="promptLeafNode" data-automation-checked="Not Checked" data-uxi-multiselectlistitem-hassidecharm="${category}">
      <div data-automation-id="promptOption" data-automation-label="${name}">${name}</div></div>`;
    if (category) o.querySelector<HTMLElement>('[data-automation-id="promptOption"]')!.addEventListener('click', () => setTimeout(() => show(tree[name]!, false), 20));
    else o.querySelector('[data-automation-id="promptLeafNode"]')!.addEventListener('click', () => {
      chipList.insertAdjacentHTML('beforeend', `<li role="option" data-automation-id="selectedItem">${name}</li>`);
      list?.remove(); list = undefined;
    });
    return o;
  };
  const show = (names: string[], category: boolean) => {
    list?.remove();
    list = document.createElement('div');
    list.setAttribute('data-automation-id', 'activeListContainer');
    list.append(...names.map((n) => row(n, category, names.length)));
    document.body.append(list);
  };
  input.addEventListener('click', () => setTimeout(() => show(Object.keys(tree), true), 20));
  input.addEventListener('keydown', (e) => {
    if (e.keyCode !== 13) return;
    const q = input.value.toLowerCase();
    const leaves = q ? Object.values(tree).flat().filter((n) => n.toLowerCase().includes(q)) : [];
    setTimeout(() => (leaves.length ? show(leaves, false) : show(Object.keys(tree), true)), 20);
  });
  const chipTexts = () => [...f.container.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => c.textContent);
  return { f, chipTexts };
}

beforeEach(() => { document.body.innerHTML = ''; at('https://example.wd1.myworkdayjobs.com/External/apply'); });

describe('fillField: nested "How did you hear" prompt', () => {
  it("opens the website category and picks the employer's site among several (live NVIDIA)", async () => {
    at('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x/apply/applyManually');
    const { f, chipTexts } = nested({
      Associations: ['SWE'], 'Job Board': ['LinkedIn', 'Indeed'], 'Social Media': ['Facebook'],
      Website: ['AI Residency Program', 'NVIDIA.COM', 'Udacity'],
    });
    expect(await fillField(f, 'Company career site', 300)).toBe('filled');
    expect(chipTexts()).toEqual(['NVIDIA.COM']);
  });

  it('opens the corporate career website category and picks its only entry', async () => {
    const { f, chipTexts } = nested({ 'Job Board': ['LinkedIn', 'Indeed'], 'Acme Corporate Career Website': ['Acme Jobs'] });
    expect(await fillField(f, 'Company career site', 300)).toBe('filled');
    expect(chipTexts()).toEqual(['Acme Jobs']);
  });

  it('a leaf the search finds is picked directly', async () => {
    const { f, chipTexts } = nested({ 'Job Board': ['LinkedIn', 'Indeed'], Website: ['Acme.com'] });
    expect(await fillField(f, 'LinkedIn', 300)).toBe('filled');
    expect(chipTexts()).toEqual(['LinkedIn']);
  });

  it.each<[string, Tree, string]>([
    ['Company Career Website > its one site', { 'Job Board': ['LinkedIn'], 'Company Career Website': ['Careers Home'] }, 'Careers Home'],
    ['NVIDIA Career Website > its one site', { 'Job Board': ['LinkedIn'], 'NVIDIA Career Website': ['External Career Site'] }, 'External Career Site'],
    ['Corporate Website > the employer among several', { 'Social Media': ['Facebook'], 'Corporate Website': ['Udacity', 'NVIDIA.com', 'Partner Site'] }, 'NVIDIA.com'],
    ['Careers > the careers site', { 'Job Board': ['LinkedIn'], Careers: ['NVIDIA Careers Site', 'Talent Community'] }, 'NVIDIA Careers Site'],
  ])('%s', async (_, tree, want) => {
    at('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x/apply/applyManually');
    const { f, chipTexts } = nested(tree);
    expect(await fillField(f, 'Company career site', 300)).toBe('filled');
    expect(chipTexts()).toEqual([want]);
  });

  it("never takes a job board's site for the company's", async () => {
    const { f, chipTexts } = nested({ 'Job Board Website': ['LinkedIn', 'Indeed'], Social: ['Facebook'] });
    expect(await fillField(f, 'Company career site', 300)).toBe('no_match');
    expect(chipTexts()).toEqual([]);
  });
});
