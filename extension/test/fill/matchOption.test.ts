import { describe, it, expect } from 'vitest';
import { matchOption } from '../../src/fill/matchOption';

const DISABILITY = ['Yes, I have a disability (or previously had a disability)', 'No, I do not have a disability and have not had one in the past', "I don't wish to answer"];

describe('matchOption', () => {
  it.each([
    ['yes', ['Yes', 'No'], 0],
    ['no', ['Yes', 'No'], 1],
    ['male', ['Female', 'Male', 'Decline'], 1],
    ['female', ['Male', 'Female'], 1],
    // Live Ashby gender identity list.
    ['male', ['Man', 'Non-binary', 'Woman', 'Prefer not to say'], 0],
    ['female', ['Man', 'Non-binary', 'Woman', 'Prefer not to say'], 2],
    ['CA', ['Alabama', 'California', 'Texas'], 1],
    ['California', ['AL', 'CA', 'TX'], 1],
    ['no', DISABILITY, 1],
    ['yes', DISABILITY, 0],
    ['decline', DISABILITY, 2],
    ['decline', ['Male', 'Female', 'I do not wish to answer'], 2],
    ['not a veteran', ['I identify as one or more of the classifications of protected veteran', 'I am not a protected veteran', "I don't wish to answer"], 1],
    ['USA', ['Canada', 'United States of America'], 1],
    // Greenhouse phone country: the dial code runs into the name (live).
    ['United States of America', ['Canada+1', 'United States+1', 'United States Minor Outlying Islands+1', 'Uruguay+598'], 1],
    ['United States', ['Canada+1', 'United States+1', 'United States Minor Outlying Islands+1'], 1],
    ['Canada', ['Cameroon+237', 'Canada+1'], 1],
    ['LinkedIn', ['Job Board', 'Social Media - LinkedIn', 'Referral'], 1],
    // Live Ashby "What brought you to this job posting": no career site, so the catch-all.
    ['Company Career Website', ['Agency', 'Glassdoor', 'Indeed', 'LinkedIn Jobs', 'Other', 'Previously worked at 1Password', 'Word of mouth'], -1],
    ['not listed', ['Agency', 'Glassdoor', 'Indeed', 'LinkedIn Jobs', 'Other', 'Previously worked at 1Password', 'Word of mouth'], 4],
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

  it('ties: shortest picks the shortest of equally good options, only when one is shortest (live skills results)', () => {
    const shortest = { ties: 'shortest' } as const;
    expect(matchOption('SQL', ['SQL DBMS', 'SQL/400'], shortest)).toBe(1);
    expect(matchOption('DHCP', ['DHCP Servers', 'DHCP Administration'], shortest)).toBe(0);
    expect(matchOption('Java', ['Java (Programming Language)', 'Java (Island)'], shortest)).toBe(-1); // qualifiers do not count toward length
    expect(matchOption('AC', ['Access Control (AC)', 'Alternating Current (AC)'], shortest)).toBe(0);
    expect(matchOption('CI/CD', ['CICD Tools', 'CICD Panes'], shortest)).toBe(-1);
    expect(matchOption('OSINT Automation', ['IT Automation', 'Design Automation'], shortest)).toBe(-1);
    // A strict match at a later stage still beats a tie at an earlier one.
    expect(matchOption('VPNs', ['Virtual Private Networks (VPNs)', 'MPLS VPNs'], shortest)).toBe(0);
  });

  // Voluntary disclosures on a live Workday tenant, 2026-10-12.
  const GENDER = ['Select One', 'Female', 'Male', 'Not declared'];
  const ETHNICITY = ['Select One', 'American Indian or Alaska Native (Not Hispanic or Latino) (United States of America)',
    'Asian (Not Hispanic or Latino) (United States of America)', 'Black or African American (Not Hispanic or Latino) (United States of America)',
    'Hispanic or Latino (United States of America)', 'I do not wish to answer. (United States of America)',
    'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino) (United States of America)',
    'Two or More Races (Not Hispanic or Latino) (United States of America)', 'White (Not Hispanic or Latino) (United States of America)'];
  const VETERAN = ['Select One', 'I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERANS LISTED ABOVE',
    'I IDENTIFY AS A VETERAN, JUST NOT A PROTECTED VETERAN', 'I AM NOT A VETERAN', 'I DO NOT WISH TO SELF-IDENTIFY'];
  it.each([
    ['male', GENDER, 2], ['female', GENDER, 1], ['decline', GENDER, 3], ['non-binary', GENDER, -1],
    ['american indian or alaska native', ETHNICITY, 1], ['asian', ETHNICITY, 2], ['black or african american', ETHNICITY, 3],
    ['hispanic or latino', ETHNICITY, 4], ['decline', ETHNICITY, 5], ['native hawaiian or other pacific islander', ETHNICITY, 6],
    ['two or more races', ETHNICITY, 7], ['white', ETHNICITY, 8],
    ['veteran', VETERAN, 1], ['not a veteran', VETERAN, 3], ['decline', VETERAN, 4],
    ['Yes', ['Select One', 'Yes', 'No'], 1], ['No', ['Select One', 'Yes', 'No'], 2],
  ])('live disclosures: %s in %j -> %i', (v, opts, i) => expect(matchOption(v, opts as string[])).toBe(i));

  it('"not listed" finds the catch-all option of a list (live Oracle school list)', () => {
    expect(matchOption('not listed', ['Binghamton University (SUNY Binghamton)', 'Not Listed/Other', 'Yale University'])).toBe(1);
    expect(matchOption('not listed', ['Yale University', 'Other'])).toBe(1);
    expect(matchOption('not listed', ['Yale University', 'Xavier University'])).toBe(-1);
  });

  it('degree short forms (live Oracle pills: Bachelor\'s, Master\'s)', () => {
    const PILLS = ["Associate's", "Bachelor's", "Master's", 'MBA', 'PhD'];
    expect(['AS', 'BS', 'BA', 'Bachelors', 'MS', 'Masters', 'MBA', 'PhD'].map((v) => matchOption(v, PILLS))).toEqual([0, 1, 1, 1, 2, 2, 3, 4]);
  });

  it('a number picks the range that holds it (live Oracle GPA pills)', () => {
    const GPA = ['0.0-1.9', '1.91-2.25', '2.26-2.75', '2.76-3.0', '3.01-3.25', '3.26-3.50', '3.51-3.75', '3.76-4.0', 'School has non-disclosure policy', 'N/A'];
    expect(matchOption('3.6', GPA)).toBe(6);
    expect(matchOption('3.60/4.00', GPA)).toBe(6);
    expect(matchOption('3.0', GPA)).toBe(3);
    expect(matchOption('4.0', GPA)).toBe(7);
    expect(matchOption('3.8 GPA', ['3.0 – 3.49', '3.5 – 4.0'])).toBe(1);
    expect(matchOption('5', GPA)).toBe(-1);
    expect(matchOption('2019', ['2018-2020', '2017-2021'])).toBe(-1); // two ranges hold it
    const RTX = ['Select One', 'Below 2.0', '2.0 - 2.49', '2.5 - 2.99', '3.0 - 3.49', '3.5 or higher']; // live Workday RTX
    expect(['3.6', '3.5', '3.2', '1.8', '4.0/4.0'].map((v) => matchOption(v, RTX))).toEqual([5, 5, 4, 1, 5]);
  });

  it('decline reaches "Choose Not to Specify" (live Oracle races)', () => {
    expect(matchOption('decline', ['Asian', 'Choose Not to Specify', 'White'])).toBe(1);
  });

  it('"company" stands for the employer\'s name (live SuccessFactors Ericsson)', () => {
    const SRC = ['Ericsson Career Website', 'LinkedIn', 'Indeed', 'Employee Referral', 'Other'];
    expect(matchOption('Company Career Website', SRC)).toBe(0);
    expect(matchOption('Company Website', ['Acme Website', 'LinkedIn'])).toBe(0);
    expect(matchOption('Company Career Website', ['Acme Career Website', 'Other Career Website'])).toBe(-1); // two employers' sites
  });

  it('US citizenship picks the demonym with its country code (live SuccessFactors)', () => {
    const NAT = ['No Selection', 'Afghan', 'American GU', 'American US', 'American VI', 'British GB'];
    expect(matchOption('United States of America', NAT)).toBe(3);
    expect(matchOption('United States', NAT)).toBe(3);
    expect(matchOption('USA', NAT)).toBe(3);
    expect(matchOption('US', NAT)).toBe(3);
  });

  it('"company career website" reaches "Ericsson Career Site" (live SuccessFactors referral source)', () => {
    const SRC = ['No Selection', 'Avature', 'BestJobs', 'Career Fair', 'Employee Referral', 'Ericsson Career Site',
      'External workforce conversion', 'Facebook', 'Glassdoor', 'Google Search', 'Indeed', 'Internal Job Board CV Search',
      'Job Board CV Search', 'Job Board Posting', 'LinkedIn – Advertisement', 'LinkedIn – Search/Networking', 'Monster',
      'My Next...(Opt in)', 'Naukri – Job Board', 'Newspaper', 'Other Social Media', 'Recruiter Networking',
      'Recruitment Agency', 'Student contract conversion', 'Twitter', 'University recruiting and events'];
    expect(matchOption('Company Career Website', SRC)).toBe(5);
    expect(matchOption('Company Careers Site', ['Acme Career Web Site', 'Indeed'])).toBe(0);
  });

  it('"Mobile" reaches a phone device type however it is named', () => {
    expect(matchOption('Mobile', ['Select One', 'Home', 'Mobile', 'Work'])).toBe(2);
    expect(matchOption('Mobile', ['Home', 'Cell', 'Work'])).toBe(1);
    expect(matchOption('Mobile', ['Landline', 'Cell Phone'])).toBe(1);
    expect(matchOption('Mobile', ['Home Phone', 'Mobile Phone', 'Work Phone'])).toBe(1);
  });

  it('"company career website" reaches "Corewell Health website" (live Workday referral source)', () => {
    const SRC = ['Select One', 'ACEMAPP', 'Career Builder', 'CareerMD', 'College/University Career fair', 'Conference',
      'Corewell Health website', 'Diversity job posting site', 'DiversityMD', 'Facebook', 'Glassdoor', 'Google',
      'Indeed.com', 'Internet Job Board', 'LinkedIn', 'Mlive.com', 'Veteran source', 'ZipRecruiter'];
    expect(matchOption('Company Career Website', SRC)).toBe(6);
    // A career site still wins over a plain one, and a job board's website is no employer's site.
    expect(matchOption('Company Career Website', ['Acme Website', 'Acme Careers Site'])).toBe(1);
    expect(matchOption('Company Career Website', ['Job Board Website', 'Indeed'])).toBe(-1);
  });
  it('"USD" reaches "US Dollar", not its settlement variants (live Oracle currency list)', () => {
    expect(matchOption('USD', ['UAE Dirham', 'US Dollar', 'US Dollar (next day)', 'US Dollar (same day)'])).toBe(1);
  });
});
