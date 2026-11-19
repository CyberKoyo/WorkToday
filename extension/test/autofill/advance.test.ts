import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { complete, nextButton, markAdvance, advancePending, clearAdvance, watchManualNext } from '../../src/autofill/advance';
import type { AutofillReport } from '../../src/autofill/runAutofill';

// jsdom lays nothing out; a control is on screen unless an ancestor hides it.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.closest('[style*="display: none"]') ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => { vi.restoreAllMocks(); clearAdvance(); });

const report = (r: Partial<AutofillReport>): AutofillReport => ({ filled: 2, skipped: 0, attention: [], missed: [], ...r });

describe('complete', () => {
  it('only when nothing is left for the applicant', () => {
    expect(complete(report({}))).toBe(true);
    expect(complete(report({ filled: 0, skipped: 3 }))).toBe(true); // a step already filled
    expect(complete(report({ attention: [{} as never] }))).toBe(false);
    expect(complete(report({ missed: ['Cobol'] }))).toBe(true); // a skill the catalog lacks; anything else is also in attention
    expect(complete(report({ answerError: 'limit' }))).toBe(false);
    expect(complete(report({ reloading: true }))).toBe(false);
    expect(complete(report({ filled: 0 }))).toBe(false); // no fields: not a step we filled
  });
});

describe('nextButton', () => {
  it('finds Next / Save and Continue', () => {
    document.body.innerHTML = '<button>Back</button><button data-automation-id="pageFooterNextButton">Save and Continue</button>';
    expect(nextButton(document)?.textContent).toBe('Save and Continue');
    document.body.innerHTML = '<input type="submit" value="Next">';
    expect(nextButton(document)).toBe(document.querySelector('input'));
  });
  it('never the final submit, a hidden or a disabled button', () => {
    document.body.innerHTML = `<button>Submit</button><button>Submit Application</button><input type="submit" value="Finish Later">
      <button>Apply</button><div style="display: none;"><button>Continue</button></div><button disabled>Next</button>`;
    expect(nextButton(document)).toBeNull();
  });
});

describe('advance marker', () => {
  it('set, read and cleared', () => {
    expect(advancePending()).toBe(false);
    markAdvance();
    expect(advancePending()).toBe(true);
    clearAdvance();
    expect(advancePending()).toBe(false);
  });
});

describe('watchManualNext', () => {
  it("the applicant's own Next marks the step to fill itself; Submit never does", () => {
    clearAdvance();
    document.body.innerHTML = '<button id="s"><span>Submit</span></button><button id="n"><span>Save and Continue</span></button>';
    watchManualNext(document);
    document.querySelector<HTMLElement>('#s span')!.click();
    expect(advancePending()).toBe(false);
    document.querySelector<HTMLElement>('#n span')!.click();
    expect(advancePending()).toBe(true);
    clearAdvance();
  });
});
