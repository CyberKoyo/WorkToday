import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FieldDescriptor, ProfileKey } from '@wf/shared';
import { greenhouse } from '../../src/greenhouse/adapter';
import { runAutofill } from '../../src/autofill/runAutofill';
import { emptyProfile, emptyEdu } from '../../src/profile/profile';
import { matchOption } from '../../src/fill/matchOption';
import type { ExtractedField } from '../../src/ats/field';

// MongoDB's intern application (live 2026-11-13): seven questions were left unanswered. The form is the real capture;
// the dropdown lists are what the live page shows once each is opened (Greenhouse's job board API, same day), and the
// keys are what the mapping service answered for these labels.
const CHOICES: Array<[string, string[]]> = [
  ['What is your expected graduation date?', ['December 2026/January 2027', 'May/June 2027', 'December 2027/January 2028', 'May/June 2028',
    'December 2028/January 2029', 'May/June 2029', 'December 2029/January 2030', 'May/June 2030', 'December 2030/January 2031', 'Other']],
  ['Will you now or in the future require employment sponsorship', ['Yes, I will require sponsorship', 'No, I will not require sponsorship']],
  ['Are you available to work full-time', ['Yes', 'No']],
  ['Which of the following locations', ['New York, NY', 'Austin, TX', 'San Francisco, CA']],
  ['Have you ever worked at MongoDB', ['Yes', 'No']],
  ['Would you like to stay up to date', ['Yes', 'No']],
  ['Receive alerts', ['Yes', 'No']],
];
const HEARD = ['AfroTech / Blavity', 'Black is Tech', 'Built in Austin', 'College Careers Page / Event', 'ColorStack', 'The Diana Initiative',
  'Glassdoor', 'Jumpstart', 'Lesbians Who Tech (LWT)', 'Life at MongoDB Blog', 'LinkedIn', 'Latinas in Tech (LiT)', 'Mogul', 'MongoDB Careers Page',
  'MongoDB Employee (Current or Former)', 'MongoDB Event', 'MongoDB Podcast', 'MongoDB Social Media Channels', 'MongoDB Videos',
  'MongoDB Talent Communities', 'MyGWork', 'National Sales Network (NSN)', 'Out 4 Undergrad (O4U)', 'PowertoFly', 'Rewriting the Code',
  'Vault Profile', 'Women in Technology International (WITI)', 'Women in IT Summit', 'Other'];
CHOICES.push(['How did you learn about this job?', HEARD]);
const choices = (f: { label: string }) => CHOICES.find(([start]) => f.label.startsWith(start))?.[1];
const KEYS: Record<string, ProfileKey> = {
  'First Name': 'firstName', 'Last Name': 'lastName', Email: 'email', Phone: 'phone', 'Location (City)': 'city', 'Resume/CV': 'resumeFile',
  'Chosen Name': 'preferredName', 'What college/university do you attend?': 'edu.school', 'What is your expected graduation date?': 'edu.endDate',
  'Will you now or in the future require employment sponsorship? (e.g. H1B, OPT, J1, TN)?': 'requiresSponsorship',
  'Have you ever worked at MongoDB before?': 'previouslyEmployed', 'How did you learn about this job?': 'referralSource',
  'LinkedIn Profile': 'linkedinUrl', Website: 'websiteUrl', Github: 'githubUrl',
};

describe('MongoDB application on Greenhouse (real capture)', () => {
  it('answers the questions that were left: chosen name from the profile, the rest through Gemini with each list read', async () => {
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-greenhouse-mongodb.html`, 'utf8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The page's dropdowns: a value outside the list is refused, as the live react-select does.
    const fill = vi.fn(async (f: ExtractedField, v: unknown) => {
      const list = choices(f);
      if (f.kind !== 'select' || !list) return 'filled' as const;
      return (Array.isArray(v) ? v : [String(v)]).every((x) => matchOption(x, list) !== -1) ? 'filled' as const : 'no_match' as const;
    });
    const answer = vi.fn(async (qs: FieldDescriptor[]) => new Map(qs.flatMap((q): Array<[string, string[]]> =>
      q.label.startsWith('What is your expected graduation') ? [[q.id, ['May/June 2029']]]
        : q.label.startsWith('Are you available') ? [[q.id, ['Yes']]]
          : q.label.startsWith('Which of the following locations') ? [[q.id, ['New York, NY', 'Austin, TX']]]
            : q.label.startsWith('Have you ever worked') ? [[q.id, ['No']]]
              : q.label.startsWith('Why are you interested') ? [[q.id, ['Because of my database coursework.']]] : [])));
    const r = await runAutofill({
      profile: { ...emptyProfile(), firstName: 'Ada', lastName: 'L', email: 'a@b.c', phone: '555', city: 'New York', requiresSponsorship: 'no',
        education: [{ ...emptyEdu(), school: 'MIT', endDate: '2029-05' }], reviewed: true },
      resume: null,
      extract: () => greenhouse.extract(document),
      map: async (fields) => new Map(fields.map((f) => [f.id, KEYS[f.label] ?? null])),
      fill, fillFile: vi.fn(), ensureGroups: vi.fn(), answer,
      options: async (f) => choices(f) ?? [],
    });

    const asked = new Map(answer.mock.calls[0]![0].map((q) => [CHOICES.find(([s]) => q.label.startsWith(s))?.[0] ?? q.label, q]));
    expect(asked.get('What is your expected graduation date?')!.options).toHaveLength(10); // 2029-05 is not "May/June 2029"
    expect(asked.get('Are you available to work full-time')!.options).toEqual(['Yes', 'No']);
    expect(asked.get('Which of the following locations')).toMatchObject({ kind: 'checkbox', options: ['New York, NY', 'Austin, TX', 'San Francisco, CA'] });
    expect(asked.has('Have you ever worked at MongoDB')).toBe(false); // blank in the profile means No, not Gemini's guess
    expect(asked.get('Why are you interested in this role at MongoDB?')!.kind).toBe('textarea');
    for (const never of ['Chosen Name', 'Will you now or in the future require employment sponsorship', 'How did you learn about this job?', 'Gender', 'What are your pronouns?']) {
      expect(asked.has(never)).toBe(false);
    }

    const last = new Map(fill.mock.calls.map(([f, v]) => [f.label, v]));
    expect(last.get('Chosen Name')).toBe('Ada'); // no chosen name in the profile: the first name
    expect(last.get('What is your expected graduation date?')).toBe('May/June 2029');
    expect(last.get('Are you available to work full-time for 12 weeks in Summer 2027?')).toBe('Yes');
    expect(last.get('Which of the following locations are you open to living and working in Summer 2027?')).toEqual(['New York, NY', 'Austin, TX']);
    expect(last.get('Have you ever worked at MongoDB before?')).toBe('No');
    expect(last.get('Why are you interested in this role at MongoDB?')).toBe('Because of my database coursework.');
    // No default answer in the profile: the employer's own careers page, which is where this form is.
    expect(matchOption(String(last.get('How did you learn about this job?')), HEARD)).toBe(HEARD.indexOf('MongoDB Careers Page'));
    expect(r.answered!.map((f) => f.label.slice(0, 20))).toEqual(['How did you learn ab', 'What is your expecte', 'Are you available to', 'Which of the followi', 'Why are you interest']);
    const stuck = r.attention.map((f) => f.label);
    for (const done of ['Chosen Name', 'What is your expected graduation date?', 'Have you ever worked at MongoDB before?']) expect(stuck).not.toContain(done);
  });
});
