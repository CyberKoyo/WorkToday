// SAP SuccessFactors career site selectors. Pinned to a live Ericsson apply page (career2.successfactors.eu, 2026-10-13).
export const SF = {
  form: 'form#careerform',
  // Registration (fbclc_), application (tor__f) and job-question (fbjq_) fields; the job search page has none.
  applicationField: '[name^="fbclc_"],[name^="tor__f"],[name^="fbjq_"]',
  // The language menu in the page header is a combobox inside the same form.
  chrome: '.sfDropMenuBtn',
  // Paginated picklist: a combobox text box whose aria-label keeps the label's markup as text ("<br>Have you…").
  picklist: '.paginatedPicklistContainer',
  rowLabel: 'th label',
  heading: '#jobAppPageTitle, h1',
  // Resume / cover letter slots: "+" opens a dialog whose file input uploads on change (no upload button).
  attachment: '.attachmentField',
  attachmentLabel: 'label.rcmFormFieldLabel',
  attachIcon: '.addAttachments',
  attached: '.attachmentBtn.successBtn',
  uploadInput: '[role="dialog"] input[type="file"]',
} as const;
