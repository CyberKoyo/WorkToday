import { describe, it, expect } from 'vitest';
import { adaptForLabel, formatForPlaceholder } from '../../src/fill/dateParts';

describe('adaptForLabel', () => {
  it('takes the part the label asks for', () => {
    expect(adaptForLabel('Start date year', '2019-09')).toBe('2019');
    expect(adaptForLabel('Start Date Month', '2019-09')).toBe('September');
    expect(adaptForLabel('Start Date', '2019-09')).toBe('2019-09');
    expect(adaptForLabel('End month', '2019')).toBe('2019');
    expect(adaptForLabel('Years of experience', '5')).toBe('5');
  });
  it('leaves a combined month/year field to the placeholder', () => {
    expect(adaptForLabel('Start Month/Year', '2019-09')).toBe('2019-09');
  });
});
describe('formatForPlaceholder', () => {
  it('follows the placeholder', () => {
    expect(formatForPlaceholder('MM/YYYY', '2019-09')).toBe('09/2019');
    expect(formatForPlaceholder('mm/dd/yyyy', '2019-09')).toBe('09/01/2019');
    expect(formatForPlaceholder('DD/MM/YYYY', '2019-09')).toBe('01/09/2019');
    expect(formatForPlaceholder('YYYY-MM-DD', '2019-09')).toBe('2019-09-01');
    expect(formatForPlaceholder('', '2019-09')).toBe('2019-09');
    expect(formatForPlaceholder('MM/YYYY', 'Ada')).toBe('Ada');
  });
});

describe('dates with a day (certifications)', () => {
  it('keeps the day for a full-date placeholder and a Day box', () => {
    expect(formatForPlaceholder('MM/DD/YYYY', '2024-03-15')).toBe('03/15/2024');
    expect(formatForPlaceholder('MM/DD/YYYY', '2024-03')).toBe('03/01/2024');
    expect(formatForPlaceholder('MM/YYYY', '2024-03-15')).toBe('03/2024');
    expect(adaptForLabel('Issue date day', '2024-03-05')).toBe('5');
    expect(adaptForLabel('Issue date month', '2024-03-05')).toBe('March');
  });
});
