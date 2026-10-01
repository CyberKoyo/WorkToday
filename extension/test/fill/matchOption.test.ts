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

  it('never guesses', () => {
    expect(matchOption('Martian', ['Yes', 'No'])).toBe(-1);
    expect(matchOption('engineer', ['Software Engineer', 'Hardware Engineer'])).toBe(-1);
    expect(matchOption('', ['Yes'])).toBe(-1);
    expect(matchOption('yes', [])).toBe(-1);
  });
});
