import { describe, it, expect } from 'vitest';
import { emptyProfile, normalizeProfile, normalizeMonth, resolveProfileValue, SCALAR_KEYS } from '../../src/profile/profile';

describe('normalizeMonth', () => {
  it.each([
    ['2021-03', '2021-03'], ['2021', '2021'], ['Mar 2021', '2021-03'], ['March 2021', '2021-03'],
    ['03/2021', '2021-03'], ['Present', ''], ['', ''], ['garbage', ''],
  ])('%s -> %s', (i, o) => expect(normalizeMonth(i)).toBe(o));
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
  it('skills list; resumeFile -> null', () => {
    expect(resolveProfileValue(p, 'skills', 0)).toEqual(['TS', 'Go']);
    expect(resolveProfileValue(p, 'resumeFile', 0)).toBeNull();
  });
});
