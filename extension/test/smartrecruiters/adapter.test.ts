// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { smartrecruiters as sr } from '../../src/smartrecruiters/adapter';
import { pickAdapter } from '../../src/ats/registry';

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
