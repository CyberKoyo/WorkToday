import { describe, it, expect } from 'vitest';
import { matchOption } from '../../src/fill/matchOption';

// However the resume and the site each spell a degree, the same level (and kind, when both say it) is picked.
const SPELLINGS = ['BS', 'B.S.', 'BSc', 'Bachelors', "Bachelor's", 'Bachelor of Science', 'Bachelors of Science',
  "Bachelor's of Science", 'Bachelor of Science in Computer Science', 'B.S. in Computer Science', 'BS Computer Science'];

describe('degree matching', () => {
  it.each([
    [['Select One', "Bachelor's Degree", "Master's Degree"], 1],
    [['Associates', 'Bachelors', 'Masters', 'Doctorate'], 1],
    [['High School', 'Bachelor Degree', 'Master Degree'], 1],
    [['Associate of Science (AS)', 'Bachelor of Science (BS)', 'Master of Science (MS)'], 1],
    [['A.S.', 'B.S.', 'M.S.', 'Ph.D.'], 1],
    [['Bachelor of Arts', "Bachelor's Degree", 'Master of Science'], 1], // the generic one, not the arts degree
    [['Undergraduate Degree / Bachelors', 'Graduate Degree / Masters'], 0],
    [['4 Year Degree', '2 Year Degree', 'Graduate Degree'], 0],
  ] as Array<[string[], number]>)('a bachelor of science reaches %j', (opts, i) => {
    for (const v of SPELLINGS) expect([v, matchOption(v, opts)]).toEqual([v, i]);
  });

  // Lists that name the kind: every spelling that says science reaches the science degree.
  it.each([
    [['BA', 'BS', 'MA', 'MS'], 1],
    [['Bachelor of Arts', 'Bachelor of Science', 'Master of Arts', 'Master of Science'], 1],
    [["Bachelor's Degree", 'Bachelor of Science', 'Master of Science'], 1],
  ] as Array<[string[], number]>)('a bachelor of science picks its kind in %j', (opts, i) => {
    for (const v of SPELLINGS.filter((s) => /s(c)?\b|science/i.test(s) && !/^bachelor'?s$/i.test(s))) {
      expect([v, matchOption(v, opts)]).toEqual([v, i]);
    }
    expect(matchOption('Bachelors', ["Bachelor's Degree", 'Bachelor of Science'])).toBe(0); // no kind: the generic one
  });

  it('a degree with no kind takes the generic option, and skips a choice between kinds', () => {
    expect(matchOption('Bachelors', ['Bachelor of Arts', 'Bachelor of Science', "Bachelor's Degree"])).toBe(2);
    expect(matchOption("Bachelor's", ['Bachelor of Arts', 'Bachelor of Science'])).toBe(-1);
    expect(matchOption('Bachelors', ['Bachelor of Science', 'Master of Science'])).toBe(0); // only one bachelor's
  });

  it('a degree of one kind never takes another kind', () => {
    expect(matchOption('BS', ['Bachelor of Arts', 'Master of Science'])).toBe(-1);
    expect(matchOption('Bachelor of Arts', ['BA', 'BS'])).toBe(0);
    expect(matchOption('B.A.', ['Bachelor of Arts', 'Bachelor of Science'])).toBe(0);
  });

  it('other levels', () => {
    const OPTS = ['High School Diploma / GED', "Associate's Degree", "Bachelor's Degree", "Master's Degree",
      'Master of Business Administration (MBA)', 'Doctorate (PhD)', 'Juris Doctor (JD)', 'Doctor of Medicine (MD)'];
    expect(['GED', 'High School', 'AS', 'Associate of Arts', "Master's", 'M.S.', 'Master of Engineering', 'MBA', 'M.B.A.',
      'PhD', 'Ph.D.', 'Doctor of Philosophy', 'JD', 'MD'].map((v) => matchOption(v, OPTS)))
      .toEqual([0, 0, 1, 1, 3, 3, 3, 4, 4, 5, 5, 5, 6, 7]);
  });

  it('a list with no degrees is left to ordinary matching', () => {
    expect(matchOption('Yes', ['Yes', 'No'])).toBe(0);
    expect(matchOption('Massachusetts', ['Maine', 'Massachusetts'])).toBe(1);
  });
});
