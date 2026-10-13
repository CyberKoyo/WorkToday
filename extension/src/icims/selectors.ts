// iCIMS selectors (inside the icims_content_iframe). Pinned to live markup in Task 9.
export const IC = {
  form: 'form#cpForm, form[name="cpForm"], form#profileForm, form[name="profileForm"], form#questions, form[name="questions"]',
  // iCIMS draws a custom widget (link + search box) over each native <select>; only the select is a field.
  widgetChrome: 'a.dropdown-select, input.dropdown-search',
  heading: 'h1, h2, .iCIMS_Header',
  resumeRow: '.iCIMS_TableRow, form',
  resumeFileName: 'input[type="hidden"][id$="Resume_FileName"]',
} as const;
