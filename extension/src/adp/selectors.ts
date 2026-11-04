// ADP Recruiting Management selectors (recruiting.adp.com/srccar, reached from myjobs.adp.com after sign-in).
// Pinned to a live WWT application (2026-10-27). Dojo/dijit widgets, no shadow DOM.
export const AD = {
  // Each step loads into this pane; the header's language picker sits outside it.
  component: '.srccarAppComponent',
  step: '.srccarSteps .step',
  activeStep: '.srccarSteps .step.active',
  // The pager's arrow (no text); a hidden two-button pager keeps another copy.
  next: '.srccarPager .appGo',
  // One per question: a <label> beside the widget, not tied to it by for=.
  element: '.element',
  label: ':scope > label',
  // Help text inside the label ("Note: Do not use values such as None…").
  note: '.indentedButtonSubText',
  // A ValidationTextBox keeps a read-only icon input beside the real one; the real one is alone in this box.
  textBox: '.dijitInputContainer',
  // "Reviewed" under the data protection and e-signature notices; the applicant asked for it to be ticked.
  consent: 'input[name="accept"]',
  // "How did you hear about us?": the list, and its follow-up boxes parked hidden until a source asks for one.
  source: '[name="subSource_zzapSource"]',
  sourceParked: '.source_holding',
  // Documents step: one box per document. Choosing a file uploads it at once (docupload_local.ajax); the box then shows a check.
  docBox: '.docBox',
  docTitle: '.docBoxHeader',
  docRequired: ':scope > .documentRequired',
  docAttached: '.docBoxChecked',
  // Screening questions: one row each, shown one at a time as the previous one is answered (no server call).
  questionRow: '.questionRow',
  // The question itself, without the notes under it.
  questionText: ':scope > .required',
  // dijit radios carry the same class as checkboxes.
  checkbox: 'input.dijitCheckBoxInput[type="checkbox"]',
  // EEO step: radio groups in a fieldset, each option's name in bold; a group is asked by the bold text or preamble before it.
  radio: 'fieldset.radio input[type="radio"]',
  ask: 'span.bold,.preamble',
  option: 'span.bold',
  // dijit Select: opens on mousedown (not click); its rows render in #<id>_menu only once opened.
  select: 'table.dijitSelect[role="listbox"]',
  selectShown: '.dijitSelectLabel',
  menuItem: 'tr[role="option"]',
  // The row's text without its submenu marker ("+").
  menuLabel: '.dijitMenuItemLabel',
  placeholder: /please specify/i,
} as const;

// ADP tax credit (WOTC) screening: a modal iframe on the application's tax step (tcs.adp.com/txcs-ui/taxcredits).
// Pinned to the live WWT screening (2026-10-27). SDF web components; the applicant opts out by default.
export const TX = {
  // "Opt Out" on the questionnaire; "Submit" on the opt-out form. Matched by their text.
  button: 'sdf-button',
  // "Do you wish to Opt Out…?": its Cancel / Opt out buttons sit in the pane's shadow root.
  confirmPane: 'sdf-focus-pane[status="warning"]',
  // The opt-out form's one open question; name and address come prefilled.
  ageGroup: '#AgeCheck_OptOut',
  ageLabel: '[id$="-label"]',
  // Shown once the age is answered "under 40": sdf-date-picker > sdf-input > input, each in its own shadow root (mm/dd/yyyy).
  dob: '[data-questionid="DateOfBirth_OptOut"]',
  // role="radio" hosts with value YES / NO and aria-checked.
  radio: 'sdf-radio-button',
} as const;
