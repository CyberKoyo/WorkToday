import { describe, it, expect } from 'vitest';
import { keepManualAnswers } from '../../src/options/mergeManual';
import { emptyProfile } from '../../src/profile/profile';

describe('keepManualAnswers', () => {
  it('keeps manual-only answers from current and takes everything else from parsed', () => {
    const current = {
      ...emptyProfile(),
      firstName: 'OldFirst', email: 'old@example.com',
      workAuthorized: 'yes', requiresSponsorship: 'no', willingToRelocate: 'yes',
      desiredSalary: '100k', earliestStartDate: '2024-01', referralSource: 'friend',
      gender: 'female', ethnicity: 'asian', veteranStatus: 'not a veteran', disabilityStatus: 'no',
      skills: ['Old'],
    };
    const { reviewed, ...currentNoReviewed } = current;
    const parsed = {
      ...emptyProfile(),
      firstName: 'NewFirst', email: 'new@example.com',
      workAuthorized: '', requiresSponsorship: '', willingToRelocate: '',
      desiredSalary: '', earliestStartDate: '', referralSource: '',
      gender: '', ethnicity: '', veteranStatus: '', disabilityStatus: '',
      skills: ['New'],
    };
    const merged = keepManualAnswers(parsed, currentNoReviewed);
    // extracted keys come from parsed
    expect(merged.firstName).toBe('NewFirst');
    expect(merged.email).toBe('new@example.com');
    expect(merged.skills).toEqual(['New']);
    // manual-only keys come from current
    expect(merged.workAuthorized).toBe('yes');
    expect(merged.requiresSponsorship).toBe('no');
    expect(merged.willingToRelocate).toBe('yes');
    expect(merged.desiredSalary).toBe('100k');
    expect(merged.earliestStartDate).toBe('2024-01');
    expect(merged.referralSource).toBe('friend');
    expect(merged.gender).toBe('female');
    expect(merged.ethnicity).toBe('asian');
    expect(merged.veteranStatus).toBe('not a veteran');
    expect(merged.disabilityStatus).toBe('no');
  });
});
