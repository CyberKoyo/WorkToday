import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { adpTax, openOptOut } from '../../src/adp/tax';
import { pickAdapter } from '../../src/ats/registry';
import { CONTENT_MATCHES } from '../../src/ats/matches';

const load = () => { document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-adp-tax-optout.html`, 'utf8'); };

// The questionnaire's first page as the live one behaves: Opt Out raises a warning pane whose own "Opt out"
// (in its shadow root) swaps in the opt-out form.
function questionnaire() {
  document.body.innerHTML = '<h1>Work Opportunity Tax Credit Questionnaire</h1><sdf-button>Next</sdf-button><sdf-button> Opt Out</sdf-button>';
  document.querySelectorAll('sdf-button')[1]!.addEventListener('click', () => {
    const pane = document.createElement('sdf-focus-pane');
    pane.setAttribute('status', 'warning');
    pane.textContent = 'Do you wish to Opt Out of the Work Opportunity Tax Credit Questionnaire?';
    pane.attachShadow({ mode: 'open' }).innerHTML = '<sdf-button>Cancel</sdf-button><sdf-button>Opt out</sdf-button>';
    pane.shadowRoot!.querySelectorAll('sdf-button')[1]!.addEventListener('click', load);
    document.body.append(pane);
  });
}

// The picker as the live one nests it: sdf-date-picker > sdf-input > input, each in a shadow root.
function dobPicker(form: HTMLElement): HTMLInputElement {
  const picker = document.createElement('sdf-date-picker');
  picker.setAttribute('data-questionid', 'DateOfBirth_OptOut');
  const box = document.createElement('sdf-input');
  picker.attachShadow({ mode: 'open' }).append(box);
  const input = document.createElement('input');
  box.attachShadow({ mode: 'open' }).append(input);
  form.append(picker);
  return input;
}

describe('adp tax credit screening', () => {
  it('runs in the tcs.adp.com iframe only', () => {
    expect(pickAdapter(new URL('https://tcs.adp.com/txcs-ui/taxcredits/'))?.id).toBe('adp-tax');
    expect(adpTax.detect(new URL('https://tcs.adp.com.evil.example/'))).toBe(false);
    expect(CONTENT_MATCHES).toContain('*://tcs.adp.com/*');
  });
  it('opts out: Opt Out, then the warning pane\'s Opt out, then the opt-out form', async () => {
    questionnaire();
    expect(adpTax.isFormPage(document)).toBe(true);
    expect(adpTax.extract(document)).toEqual([]);
    await openOptOut(document, 500);
    expect(document.getElementById('AgeCheck_OptOut')).not.toBeNull();
  });
  it('the live opt-out form asks the age, then (under 40) the birth date, both from the profile', () => {
    load();
    const fields = adpTax.extract(document);
    expect(fields.map((f) => [f.label, f.kind, f.required, f.options, f.profileKey, f.asked?.()])).toEqual([
      ['Are you under age 40?', 'radio', true, ['YES', 'NO'], 'under40', undefined],
      ['Date of birth', 'text', true, undefined, 'dateOfBirth', false],
    ]);
    dobPicker(fields[1]!.container);
    expect(fields[1]!.asked!()).toBe(true);
  });
  it('types the birth date into the picker as mm/dd/yyyy', async () => {
    load();
    const dob = adpTax.extract(document)[1]!;
    const input = dobPicker(dob.container);
    expect(await adpTax.fill(dob, '2001-01-31')).toBe('filled');
    expect(input.value).toBe('01/31/2001');
    expect(await adpTax.fill(dob, '2001-01-31')).toBe('skipped_nonempty');
    input.value = '';
    expect(await adpTax.fill(dob, 'January 2001')).toBe('no_match');
  });
  it('on the thank-you page, presses Done to close the dialog', async () => {
    document.body.innerHTML = '<p>Thank you for completing the Work Opportunity Tax Credit Questionnaire!</p><sdf-button>Done</sdf-button>';
    const click = vi.spyOn(document.querySelector<HTMLElement>('sdf-button')!, 'click');
    expect([adpTax.isFormPage(document), adpTax.stepKey(document), adpTax.extract(document)]).toEqual([true, 'done', []]);
    await openOptOut(document, 200);
    expect(click).toHaveBeenCalled();
  });
  it('ticks the answer and submits only the opt-out form', async () => {
    load();
    const [f] = adpTax.extract(document);
    const yes = f!.members![0]!;
    const click = vi.spyOn(yes, 'click');
    expect(await adpTax.fill(f!, 'Yes')).toBe('filled');
    expect(click).toHaveBeenCalled();
    expect(adpTax.nextButton!(document)?.textContent?.trim()).toBe('Submit');
    questionnaire();
    expect(adpTax.nextButton!(document)).toBeNull(); // never the questionnaire's own buttons
  });
});
