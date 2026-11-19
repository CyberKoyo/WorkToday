import { describe, it, expect } from 'vitest';
import { emptyProfile, normalizeProfile, normalizeMonth, normalizeDate, resolveProfileValue, SCALAR_KEYS } from '../../src/profile/profile';

describe('normalizeMonth', () => {
  it.each([
    ['2021-03', '2021-03'], ['2021', '2021'], ['Mar 2021', '2021-03'], ['March 2021', '2021-03'],
    ['03/2021', '2021-03'], ['03/15/2021', '2021-03'], ['3-15-2021', '2021-03'], ['2021/03/15', '2021-03'],
    ['March 15, 2021', '2021-03'], ['Mar 15 2021', '2021-03'], ['13/15/2021', ''], ['Present', ''], ['', ''], ['garbage', ''],
  ])('%s -> %s', (i, o) => expect(normalizeMonth(i)).toBe(o));
});

describe('normalizeDate (certifications keep the day)', () => {
  it.each([
    ['03/15/2024', '2024-03-15'], ['3-5-2024', '2024-03-05'], ['2024-03-15', '2024-03-15'], ['2024/3/15', '2024-03-15'],
    ['March 15, 2024', '2024-03-15'], ['Mar 15 2024', '2024-03-15'], ['2024-03', '2024-03'], ['March 2024', '2024-03'],
    ['13/15/2024', ''], ['garbage', ''],
  ])('%s -> %s', (i, o) => expect(normalizeDate(i)).toBe(o));
});

describe('normalizeProfile', () => {
  it('fills missing keys, trims, coerces lists, never marks reviewed', () => {
    const p = normalizeProfile({
      firstName: '  Ada ', email: 'a@b.c', reviewed: true, skills: ['TS', 5, ''],
      work: [{ title: 'Eng', company: 'X', startDate: 'Jan 2020', endDate: 'Present' }, 'junk'],
      education: [{ school: 'MIT', gpa: 3.9 }],
    });
    expect(p.firstName).toBe('Ada');
    expect(p.lastName).toBe('');
    expect(p.reviewed).toBe(false);
    expect(p.skills).toEqual(['TS', '5']);
    expect(p.work).toEqual([{ title: 'Eng', company: 'X', location: '', startDate: '2020-01', endDate: '', current: true, description: '' }]);
    expect(p.education[0]).toMatchObject({ school: 'MIT', gpa: '3.9' });
    for (const k of SCALAR_KEYS) expect(typeof p[k]).toBe('string');
  });
  it('returns empty profile for non-object', () => {
    expect(normalizeProfile('x')).toEqual(emptyProfile());
  });
});

describe('resolveProfileValue', () => {
  const p = { ...emptyProfile(), firstName: 'Ada', skills: ['TS', 'Go'],
    work: [{ title: 'A', company: 'C1', location: '', startDate: '2020-01', endDate: '', current: true, description: '' },
           { title: 'B', company: 'C2', location: '', startDate: '2018-01', endDate: '2019-12', current: false, description: '' }] };
  it('scalars; empty string -> null', () => {
    expect(resolveProfileValue(p, 'firstName', 0)).toBe('Ada');
    expect(resolveProfileValue(p, 'lastName', 0)).toBeNull();
  });
  it('repeat groups by index; out of range -> null', () => {
    expect(resolveProfileValue(p, 'work.title', 1)).toBe('B');
    expect(resolveProfileValue(p, 'work.current', 0)).toBe(true);
    expect(resolveProfileValue(p, 'work.endDate', 0)).toBeNull();
    expect(resolveProfileValue(p, 'work.title', 5)).toBeNull();
    expect(resolveProfileValue(p, 'edu.school', 0)).toBeNull();
  });
  it('certification values by group; no proof in the profile', () => {
    const c = normalizeProfile({ certifications: [{ name: 'CISSP', issuedDate: '2021-03-15' }, { name: 'CCNA', number: 42 }, 'junk'] });
    expect(c.certifications).toEqual([
      { name: 'CISSP', number: '', issuedDate: '2021-03-15', expirationDate: '' },
      { name: 'CCNA', number: '42', issuedDate: '', expirationDate: '' },
    ]);
    expect(resolveProfileValue(c, 'cert.name', 1)).toBe('CCNA');
    expect(resolveProfileValue(c, 'cert.expirationDate', 0)).toBeNull();
    expect(resolveProfileValue(c, 'cert.proof', 0)).toBeNull();
    expect(resolveProfileValue(c, 'cert.name', 5)).toBeNull();
  });
  it('skills list; resumeFile -> null', () => {
    expect(resolveProfileValue(p, 'skills', 0)).toEqual(['TS', 'Go']);
    expect(resolveProfileValue(p, 'resumeFile', 0)).toBeNull();
  });
});
