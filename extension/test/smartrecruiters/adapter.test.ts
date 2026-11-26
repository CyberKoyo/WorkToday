// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { smartrecruiters as sr } from '../../src/smartrecruiters/adapter';
import { pickAdapter } from '../../src/ats/registry';
import { emptyProfile, emptyWork, emptyEdu, type Profile } from '../../src/profile/profile';

// Shadow roots do not survive a saved page, so the live structure (Wellmark, 2026-11-17) is rebuilt here.
function shadow(host: Element, html: string) { host.attachShadow({ mode: 'open' }).innerHTML = html; return host.shadowRoot!; }
function load() {
  document.body.innerHTML = `<oc-oneclick-form>
    <spl-typography-title>Personal information</spl-typography-title>
    <spl-input id="first-name-input" label="First name" required=""></spl-input>
    <spl-input id="linkedin-input" label="LinkedIn"></spl-input>
    <oc-phone-number><spl-phone-field></spl-phone-field></oc-phone-number>
    <oc-apply-with-resume><spl-dropzone></spl-dropzone></oc-apply-with-resume>
    <oc-resume-upload><spl-dropzone></spl-dropzone></oc-resume-upload>
    <spl-textarea id="hiring-manager-message-input" label="Let the company know about your interest working there"></spl-textarea>
  </oc-oneclick-form>`;
  for (const h of document.querySelectorAll('spl-input')) shadow(h, `<label for="${h.id}">${h.getAttribute('label')}</label><input id="${h.id}" type="text">`);
  const phone = shadow(document.querySelector('spl-phone-field')!, '<spl-select><input role="combobox" aria-label="Search by country/region or code"></spl-select><spl-input></spl-input>');
  shadow(phone.querySelector('spl-input')!, '<input type="tel" aria-label="Phone number" aria-required="true">');
  for (const h of document.querySelectorAll('spl-dropzone')) shadow(h, '<div><label>Choose a file</label><input type="file"></div>');
  shadow(document.querySelector('spl-textarea')!, '<textarea></textarea>');
}

describe('smartrecruiters adapter (oneclick apply page)', () => {
  it('is picked on jobs.smartrecruiters.com', () => {
    expect(pickAdapter(new URL('https://jobs.smartrecruiters.com/oneclick-ui/company/Acme/publication/1'))?.id).toBe('smartrecruiters');
  });
  it('reads the fields through their shadow roots', () => {
    load();
    expect(sr.isFormPage(document)).toBe(true);
    const fields = sr.extract(document);
    expect(fields.map((f) => [f.label, f.kind, f.required])).toEqual([
      ['First name', 'text', true], ['LinkedIn', 'text', false], ['Phone number', 'text', true], ['Resume', 'file', true],
      ['Let the company know about your interest working there', 'textarea', false],
    ]);
    expect(fields[3]!.profileKey).toBe('resumeFile');
    expect(fields[3]!.container.closest('oc-resume-upload')).not.toBeNull(); // not the Easy Apply box
  });
  it('fills the input inside the component', async () => {
    load();
    const fields = sr.extract(document);
    expect(await sr.fill(fields[0]!, 'Ada')).toBe('filled');
    expect(document.querySelector('#first-name-input')!.shadowRoot!.querySelector('input')!.value).toBe('Ada');
    expect(await sr.fill(fields[2]!, '6175550100')).toBe('filled');
    expect(await sr.fill(fields[0]!, 'Bob')).toBe('skipped_nonempty');
  });
});

// Experience and Education (live Wellmark, 2026-11-26): "Add" opens an inline editor of web components; Save turns
// it into a card. The fake echoes what the live one does: the typed text as the first option, a location's
// suggestions only, and Save refused while a required field (From) is empty.
function section(name: 'experience' | 'education', fields: string) {
  const sec = document.createElement(`oc-${name}`);
  sec.innerHTML = `<spl-button aria-label="Add ${name} entry">Add</spl-button>`;
  document.body.append(sec);
  sec.querySelector('spl-button')!.addEventListener('click', () => {
    const ed = document.createElement(`oc-${name}-edit-form`);
    ed.innerHTML = `${fields}<spl-button aria-label="Save ${name} entry">Save</spl-button>`;
    sec.append(ed);
    for (const h of ed.querySelectorAll('spl-autocomplete')) {
      const root = shadow(h, '<spl-input></spl-input>');
      const input = shadow(root.querySelector('spl-input')!, '<input role="combobox">').querySelector('input')!;
      input.addEventListener('input', () => {
        root.querySelectorAll('spl-select-option').forEach((o) => o.remove());
        const location = /location/i.test(h.getAttribute('label')!);
        const opts = location ? [['US_IA_CITY_des_moines', 'Des Moines, IA, US'], ['goToManualLocationMode', 'Cannot find your city?']]
          : [['#spl-custom-option', input.value], ['Other', `${input.value} Holdings Retail`]];
        for (const [value, text] of opts) {
          const o = document.createElement('spl-select-option');
          o.setAttribute('value', value!); o.textContent = text!;
          o.addEventListener('click', () => { input.value = location ? text! : input.value; h.setAttribute('data-picked', text!); });
          root.append(o);
        }
      });
    }
    for (const h of ed.querySelectorAll('spl-input,spl-textarea')) shadow(h, h.tagName === 'SPL-TEXTAREA' ? '<textarea></textarea>' : '<input>');
    for (const h of ed.querySelectorAll('spl-date-field')) shadow(h, '<input class="flatpickr-input"><input class="numInput cur-year" type="number">');
    for (const h of ed.querySelectorAll('spl-checkbox')) shadow(h, '<input type="checkbox">');
    ed.querySelector('spl-button')!.addEventListener('click', () => {
      const val = (sel: string) => ed.querySelector(sel)?.shadowRoot?.querySelector<HTMLInputElement>('input,textarea')?.value ?? '';
      const from = ed.querySelector('spl-date-field[label="From"]');
      if (from && !val('spl-date-field[label="From"]')) return;
      const picked = [...ed.querySelectorAll('spl-autocomplete')].map((a) => a.getAttribute('data-picked') ?? '');
      const card = document.createElement('div');
      card.setAttribute('data-test', `${name}-entry`);
      card.textContent = [...picked, val('spl-input[label="Major"]'), val('spl-input[label="Degree"]')].join(' ');
      ed.replaceWith(card);
    });
  });
  return sec;
}

describe('smartrecruiters experience and education', () => {
  const profile = (): Profile => ({
    ...emptyProfile(), reviewed: true,
    work: [
      { ...emptyWork(), title: 'SOC Analyst', company: 'Acme', location: 'Des Moines, IA', startDate: '2024-06', current: true, description: 'Triage' },
      { ...emptyWork(), title: 'Help Desk', company: 'Initech', location: 'Ames, IA', startDate: '2023-01', endDate: '2023-12' },
    ],
    education: [{ ...emptyEdu(), school: 'Iowa State University', degree: "Bachelor's", fieldOfStudy: 'Cybersecurity' }],
  });
  const load = () => {
    document.body.innerHTML = '<oc-oneclick-form></oc-oneclick-form>';
    const exp = section('experience', `<spl-autocomplete label="Title"></spl-autocomplete><spl-autocomplete label="Company"></spl-autocomplete>
      <spl-autocomplete label="Office location"></spl-autocomplete><spl-textarea label="Description"></spl-textarea>
      <spl-date-field label="From"></spl-date-field><spl-date-field label="To"></spl-date-field>
      <oc-checkbox><spl-checkbox><span>I currently work here</span></spl-checkbox></oc-checkbox>`);
    const edu = section('education', `<spl-autocomplete label="Institution"></spl-autocomplete><spl-input label="Major"></spl-input>
      <spl-input label="Degree"></spl-input><spl-autocomplete label="School location"></spl-autocomplete>`);
    return { exp, edu };
  };
  const cards = (sec: Element) => [...sec.querySelectorAll('[data-test$="-entry"]')].map((c) => c.textContent);

  it('adds one saved card per entry, the typed text kept and a location picked from its suggestions', async () => {
    const { exp, edu } = load();
    await sr.ensureGroups(document, profile());
    expect(cards(exp)).toEqual(['SOC Analyst Acme Des Moines, IA, US  ', 'Help Desk Initech   ']);
    expect(cards(edu)).toEqual(["Iowa State University  Cybersecurity Bachelor's"]);
    expect(sr.extract(document)).toEqual([]); // no editor left behind to read as questions
  });
  it('adds nothing already on a card, and stops at an editor the site will not save', async () => {
    const { exp } = load();
    const p = profile();
    await sr.ensureGroups(document, p);
    await sr.ensureGroups(document, p);
    expect(cards(exp)).toHaveLength(2);
    const { exp: again } = load();
    p.work[0]!.startDate = ''; // From is required
    await sr.ensureGroups(document, p);
    expect(cards(again)).toEqual([]);
    expect(again.querySelector('oc-experience-edit-form')).not.toBeNull();
  });
});
