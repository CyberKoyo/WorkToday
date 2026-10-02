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

  it('parenthetical qualifiers count as exact, but only when unique', () => {
    expect(matchOption('Python', ['Python IDLE', 'Python (Programming Language)', 'Maya Python', 'Python Numpy'])).toBe(1);
    expect(matchOption('Java', ['Java (Programming Language)', 'Java (Island)'])).toBe(-1);
  });

  it('punctuated terms match their joined spelling (TCP/IP -> TCPIP Network), only when unique', () => {
    expect(matchOption('TCP/IP', ['Internet Protocol Suite', 'TCPIP Network', 'Internet Protocol (IP)'])).toBe(1);
    expect(matchOption('Node.js', ['Node-RED', 'NodeJS'])).toBe(1);
    expect(matchOption('CI/CD', ['CICD Pipelines', 'CICD Tools'])).toBe(-1);
    expect(matchOption('Java', ['JavaScript'])).toBe(-1);
  });

  it('filler words do not count against a word-overlap match (live Field of Study results)', () => {
    expect(matchOption('Computer Science', ['Business Management Science and Computer System', 'Computer and Information Science'])).toBe(1);
  });

  it('an acronym matches the option that spells it out in parentheses, only when unique (live skills results)', () => {
    expect(matchOption('VPNs', ['Virtual Private Networks (VPNs)', 'MPLS VPNs'])).toBe(0);
    expect(matchOption('SQL', ['Structured Query Language (SQL)', 'U-SQL'])).toBe(0);
    expect(matchOption('AC', ['Access Control (AC)', 'Alternating Current (AC)'])).toBe(-1);
  });

  it('multi-word terms match an option whose words they begin, word for word, only when unique', () => {
    expect(matchOption('REST APIs', ['RESTful APIs', 'RESTful Web Services'])).toBe(0);
    expect(matchOption('Data Eng', ['Data Engineering', 'Data Engraving'])).toBe(-1);
  });

  it('a short acronym is not matched inside an unrelated name (live: MCP -> Unisys MCP)', () => {
    expect(matchOption('MCP', ['Unisys MCP', 'MCing'])).toBe(-1);
    expect(matchOption('DNS', ['DNS Server', 'DNSSEC'])).toBe(0);
  });

  it('never guesses', () => {
    expect(matchOption('Martian', ['Yes', 'No'])).toBe(-1);
    expect(matchOption('engineer', ['Software Engineer', 'Hardware Engineer'])).toBe(-1);
    expect(matchOption('', ['Yes'])).toBe(-1);
    expect(matchOption('yes', [])).toBe(-1);
  });
});
