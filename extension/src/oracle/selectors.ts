// Oracle Recruiting Cloud (HCM Candidate Experience) selectors. Pinned to live markup in Task 9.
export const OR = {
  root: '.apply-flow, [class*="apply-flow"]',
  heading: 'h2, h3, [role="heading"]',
  // Work and Education History (live 2026-10-13): Add buttons open one inline editor; saved entries are tiles.
  timeline: '.apply-flow-block--work-and-education-timeline',
  addExperience: '#timeline-add-experience-button',
  addEducation: '#timeline-add-education-button',
  experienceTile: '.beautiful-timeline__column--left [data-profile-item-tile]',
  educationTile: '.beautiful-timeline__column--right [data-profile-item-tile]',
  editorSave: 'button.save-btn',
  editorCancel: 'button.cancel-btn',
  pill: '[role="radio"].cx-select-pill-section',
  pillSelected: '.cx-select-pill-section--selected',
  // The tile layout (live 2026-11-18/19): Experience, Education, Licenses each a block with its own Add button.
  profileItems: '.apply-flow-block--tile-profile-items',
  profileItemsAdd: 'button[id^="profileItemsAddButton"]',
  currentJob: 'input[type="checkbox"][id*="currentJobFlag"]',
} as const;
