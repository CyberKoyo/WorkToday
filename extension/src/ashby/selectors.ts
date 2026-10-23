// Ashby selectors. Pinned to live jobs.ashbyhq.com application tabs (OpenAI, Ramp, Linear; 2026-10-22).
export const AS = {
  // The questions and the EEO survey are two containers; the "Autofill from resume" box sits outside both.
  form: '.ashby-application-form-container',
  // One per question; checkbox and radio groups are a fieldset inside a wrapper that carries it.
  entry: '[data-field-path]',
  title: '.ashby-application-form-question-title',
  // Yes/No: two aria-pressed buttons in front of an unlabelled checkbox.
  yesno: '.ashby-application-form-input-yesno',
  yesnoOption: '.ashby-application-form-input-yesno-option',
  // An attached file shows its name and a "Replace" button; an empty box an "Upload File" one (live 2026-10-23).
  replaceButton: /^\s*replace\s*$/i,
} as const;
