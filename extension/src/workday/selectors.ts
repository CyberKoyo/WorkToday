// Every Workday-specific selector lives here. Verify against a live page (Task 13) when Workday changes its DOM.
export const SEL = {
  fieldContainer: '[data-automation-id^="formField-"]',
  group: '[role="group"]',
  dropdownButton: 'button[aria-haspopup="listbox"]',
  dropdownPlaceholder: 'Select One',
  listboxOption: '[role="listbox"] [role="option"]',
  multiSelect: '[data-automation-id="multiSelectContainer"]', // searchable prompt (Skills, Field of Study): not auto-filled
  dateMonth: '[data-automation-id="dateSectionMonth-input"]',
  dateYear: '[data-automation-id="dateSectionYear-input"]',
  fileInput: 'input[type="file"]',
  fileUploaded: '[data-automation-id="file-upload-successful"]',
  workSection: '[data-automation-id="workExperienceSection"]',
  educationSection: '[data-automation-id="educationSection"]',
  addButton: 'button[data-automation-id="add-button"]',
  pageHeader: '[data-automation-id="pageHeader"]',
  textInput: 'input:not([type]),input[type="text"],input[type="email"],input[type="tel"],input[type="url"],input[type="number"]',
} as const;
