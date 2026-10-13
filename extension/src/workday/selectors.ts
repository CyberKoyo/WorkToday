import type { ProfileKey } from '@wf/shared';
import { TEXT_INPUT } from '../fill/dom';
// Every Workday-specific selector lives here. Verify against a live page (Task 13) when Workday changes its DOM.
export const SEL = {
  fieldContainer: '[data-automation-id^="formField-"]',
  group: '[role="group"]',
  dropdownButton: 'button[aria-haspopup="listbox"]',
  dropdownPlaceholder: 'Select One',
  listboxOption: '[role="listbox"] [role="option"]',
  multiSelect: '[data-automation-id="multiSelectContainer"]', // searchable prompt (Skills, Field of Study)
  multiSelectChip: '[data-automation-id="selectedItem"]',
  promptList: '[data-automation-id="activeListContainer"]', // one per opened prompt; may stay open after leaving it
  promptResult: '[role="option"]', // inside promptList; virtualized: only visible rows exist
  promptLeaf: '[data-automation-id="promptLeafNode"]', // the click target that actually selects
  promptLabel: '[data-automation-id="promptOption"]',
  dateMonth: '[data-automation-id="dateSectionMonth-input"]',
  dateYear: '[data-automation-id="dateSectionYear-input"]',
  fileInput: 'input[type="file"]',
  fileUploaded: '[data-automation-id="file-upload-successful"]',
  workSection: '[data-automation-id="workExperienceSection"]',
  educationSection: '[data-automation-id="educationSection"]',
  addButton: 'button[data-automation-id="add-button"]',
  pageHeader: '[data-automation-id="pageHeader"]',
  textInput: TEXT_INPUT,
} as const;

// formField-<id> → profile key, for fields whose labels do not name what they ask (live: gender is
// "how you self-identify"). hispanicOrLatino is a Yes/No question answered from the ethnicity.
export const FIELD_KEYS: Record<string, ProfileKey> = {
  gender: 'gender', hispanicOrLatino: 'ethnicity', ethnicity: 'ethnicity', veteranStatus: 'veteranStatus', degree: 'edu.degree',
};
