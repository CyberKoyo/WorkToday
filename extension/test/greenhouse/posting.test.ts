import { describe, it, expect, vi } from 'vitest';
import { greenhousePosting } from '../../src/greenhouse/posting';

// The shape of Greenhouse's job board API reply (live 2026-11-13): `content` is HTML with its tags escaped.
const reply = () => new Response(JSON.stringify({
  title: '2027 - Software Engineering Intern, AMER', location: { name: 'Austin; New York City' },
  content: '&lt;p&gt;We&#39;re seeking curious minds.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Push production-level code&amp;nbsp;daily&lt;/li&gt;&lt;li&gt;C++ &amp;amp; Go&lt;/li&gt;&lt;/ul&gt;',
}), { status: 200 });

describe('greenhousePosting', () => {
  it('reads the posting for an embedded form and for a hosted board page, as plain text', async () => {
    const f = vi.fn().mockImplementation(async () => reply());
    const text = "2027 - Software Engineering Intern, AMER\nAustin; New York City\nWe're seeking curious minds. Push production-level code daily C++ & Go";
    expect(await greenhousePosting('https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=8209134', f)).toBe(text);
    expect(await greenhousePosting('https://boards.greenhouse.io/acme/jobs/42?gh_src=x', f)).toBe(text);
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/mongodb/jobs/8209134', 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/42',
    ]);
  });
  it('asks nothing for another site or a page that is no job, and a failed lookup is no posting', async () => {
    const f = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    expect(await greenhousePosting('https://acme.wd1.myworkdayjobs.com/x/job/1', f)).toBe('');
    expect(await greenhousePosting('https://job-boards.greenhouse.io/mongodb', f)).toBe('');
    expect(await greenhousePosting('', f)).toBe('');
    expect(f).not.toHaveBeenCalled();
    expect(await greenhousePosting('https://job-boards.greenhouse.io/mongodb/jobs/1', f)).toBe('');
  });
});
