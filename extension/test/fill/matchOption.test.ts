import { describe, it, expect } from 'vitest';
import { matchOption } from '../../src/fill/matchOption';

const DISABILITY = ['Yes, I have a disability (or previously had a disability)', 'No, I do not have a disability and have not had one in the past', "I don't wish to answer"];

describe('matchOption', () => {
  it.each([
    ['yes', ['Yes', 'No'], 0],
    ['no', ['Yes', 'No'], 1],
    ['male', ['Female', 'Male', 'Decline'], 1],
    ['female', ['Male', 'Female'], 1],
    ['CA', ['Alabama', 'California', 'Texas'], 1],
    ['California', ['AL', 'CA', 'TX'], 1],
    ['no', DISABILITY, 1],
    ['yes', DISABILITY, 0],
    ['decline', DISABILITY, 2],
    ['decline', ['Male', 'Female', 'I do not wish to answer'], 2],
    ['not a veteran', ['I identify as one or more of the classifications of protected veteran', 'I am not a protected veteran', "I don't wish to answer"], 1],
    ['USA', ['Canada', 'United States of America'], 1],
    ['LinkedIn', ['Job Board', 'Social Media - LinkedIn', 'Referral'], 1],
  ])('%s in %j -> %i', (v, opts, i) => expect(matchOption(v, opts)).toBe(i));

  const DEGREES = ['Select One', 'Degree in Progress (no degree awarded)', 'High School Diploma/GED', 'Attendance (No Degree Awarded)', 'Other',
    'Non-Degree Program', "Associate's Degree", 'Technical Diploma', 'Higher Degree', "Bachelor's Degree", "Master's Degree", 'M.B.A.',
    'Doctorate Degree', 'M.D.', 'J.D.'];
  it.each([
    ['Bachelors', 9], ["Bachelor's", 9], ['BS', 9], ['B.S.', 9], ['Bachelor of Science', 9], ['BA', 9],
    ['Masters', 10], ['MS', 10], ['Master of Science', 10], ['MBA', 11], ['PhD', 12], ['Associates', 6],
  ])('degree %s -> %i (real Workday options)', (v, i) => expect(matchOption(v, DEGREES)).toBe(i));
  it('exact degree option wins over alias', () => {
    expect(matchOption('Bachelor of Science', ['Bachelor of Arts', 'Bachelor of Science'])).toBe(1);
  });

  it('never guesses', () => {
    expect(matchOption('Martian', ['Yes', 'No'])).toBe(-1);
    expect(matchOption('engineer', ['Software Engineer', 'Hardware Engineer'])).toBe(-1);
    expect(matchOption('', ['Yes'])).toBe(-1);
    expect(matchOption('yes', [])).toBe(-1);
  });
});
