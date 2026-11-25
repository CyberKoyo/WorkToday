import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate, parseResume, ResumeParseError, MAX_RESUME_BYTES } from '../../src/gemini/parseResume';

const pdf = { name: 'r.pdf', type: 'application/pdf', dataBase64: 'JVBERi0=' };
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe('parseResume', () => {
  it('asks for certifications and returns them normalized', async () => {
    const f = vi.fn().mockResolvedValue(ok({ firstName: 'Ada', certifications: [{ name: 'CISSP', number: '1', issuedDate: 'Mar 2021', expirationDate: '2024-03-15' }] }));
    const p = await parseResume(pdf, 'KEY', f);
    expect(p.certifications).toEqual([{ name: 'CISSP', number: '1', issuedDate: '2021-03', expirationDate: '2024-03-15' }]);
    expect(JSON.parse(f.mock.calls[0]![1].body).generationConfig.responseSchema.properties.certifications).toBeDefined();
  });
  it('sends inline file with key header and JSON schema; returns normalized profile', async () => {
    const f = vi.fn().mockResolvedValue(ok({ firstName: 'Ada', gender: 'female', work: [{ title: 'Eng', startDate: '2020-01' }],
      projects: [{ name: 'Chess engine', url: 'https://github.com/ada/chess', description: 'Alpha-beta search', stars: 9 }] }));
    const p = await parseResume(pdf, 'KEY', f);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain('models/gemini-3.5-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'application/pdf', data: 'JVBERi0=' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.gender).toBeUndefined();
    // Without `required`, Gemini may silently omit fields like email/phone.
    expect(body.generationConfig.responseSchema.required).toEqual(
      expect.arrayContaining(['email', 'phone', 'firstName', 'githubUrl', 'work', 'education', 'skills']));
    expect(p.firstName).toBe('Ada');
    expect(p.gender).toBe('');            // manual-only fields are discarded even if returned
    expect(p.work[0]!.title).toBe('Eng');
    expect(body.generationConfig.responseSchema.properties.projects.items.required).toEqual(['name', 'url', 'description']);
    expect(p.projects).toEqual([{ name: 'Chess engine', url: 'https://github.com/ada/chess', description: 'Alpha-beta search' }]);
    expect(p.reviewed).toBe(false);
  });
  it('fills URL fields from PDF link annotations when the model returns link text', async () => {
    const linked = { ...pdf, dataBase64: Buffer.from('%PDF-1.4 <</S/URI/URI(https://github.com/ada)>>').toString('base64') };
    const f = vi.fn().mockResolvedValue(ok({ githubUrl: 'Github' }));
    const p = await parseResume(linked, 'K', f);
    expect(p.githubUrl).toBe('https://github.com/ada');
  });
  it('sends a .docx as its text and fills links from its hyperlinks', async () => {
    const docx = { name: 'r.docx', type: 'application/octet-stream', dataBase64: readFileSync(`${__dirname}/../fixtures/resume.synthetic.docx`).toString('base64') };
    const f = vi.fn().mockResolvedValue(ok({ githubUrl: 'GitHub' }));
    const p = await parseResume(docx, 'K', f);
    const sent = JSON.parse(f.mock.calls[0]![1].body).contents[0].parts[0].inline_data;
    expect(sent.mime_type).toBe('text/plain');
    expect(Buffer.from(sent.data, 'base64').toString('utf8')).toContain('Software Engineer, Acme & Co\t2021-03 – Present');
    expect(p.githubUrl).toBe('https://github.com/ada?tab=repositories&x=1');
  });
  it('rejects an unreadable docx and an old .doc without calling network', async () => {
    const f = vi.fn();
    await expect(parseResume({ ...pdf, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, 'K', f))
      .rejects.toMatchObject({ code: 'unsupported_type' });
    await expect(parseResume({ ...pdf, name: 'r.doc', type: 'application/msword' }, 'K', f)).rejects.toMatchObject({ code: 'unsupported_type' });
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects missing key', async () => {
    await expect(parseResume(pdf, '', vi.fn())).rejects.toMatchObject({ code: 'bad_key' });
  });
  it.each([[403, 'bad_key'], [429, 'rate_limited'], [501, 'bad_response']])('HTTP %i -> %s', async (status, code) => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code });
  });
  it('an overloaded Gemini (503) is asked again, and the retry answers', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(ok({ a: 1 }));
    expect(await generate('K', [], {}, f, [0, 0])).toBe('{"a":1}');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('still overloaded after the retries -> says so', async () => {
    const f = vi.fn().mockImplementation(async () => new Response('{}', { status: 503 }));
    await expect(generate('K', [], {}, f, [0, 0])).rejects.toMatchObject({ code: 'bad_response', message: expect.stringContaining('overloaded') });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('401 -> bad_key', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code: 'bad_key' });
  });
  it('400 with a bare body -> bad_response (not assumed to be a bad key)', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code: 'bad_response' });
  });
  it('400 with API_KEY_INVALID details -> bad_key', async () => {
    const body = { error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code: 'bad_key' });
  });
  it('400 with other error body -> bad_response with Gemini message', async () => {
    const body = { error: { message: 'Request contains an invalid argument.', details: [{ reason: 'FIELD_VALIDATION_ERROR' }] } };
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 400 }));
    try {
      await parseResume(pdf, 'K', f);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: 'bad_response' });
      expect((e as Error).message).toContain('Request contains an invalid argument.');
    }
  });
  it('404 model not found -> bad_response with Gemini message', async () => {
    const body = { error: { message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' } };
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 404 }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code: 'bad_response', message: expect.stringContaining('is not found') });
  });
  it('oversize resume -> too_large without calling fetch', async () => {
    const f = vi.fn();
    const bigBase64 = 'A'.repeat(Math.ceil((MAX_RESUME_BYTES + 1) / 3) * 4);
    await expect(parseResume({ ...pdf, dataBase64: bigBase64 }, 'K', f)).rejects.toMatchObject({ code: 'too_large' });
    expect(f).not.toHaveBeenCalled();
  });
  it('several versions go in one request and come back as one profile, with the links of each', async () => {
    const a = { ...pdf, name: 'swe.pdf', dataBase64: Buffer.from('%PDF-1.4 <</S/URI/URI(https://github.com/ada)>>').toString('base64') };
    const b = { ...pdf, name: 'data.pdf', dataBase64: Buffer.from('%PDF-1.4 <</S/URI/URI(https://www.linkedin.com/in/ada)>>').toString('base64') };
    const f = vi.fn().mockImplementation(async () => ok({ firstName: 'Ada', githubUrl: 'GitHub', linkedinUrl: 'LinkedIn' }));
    const p = await parseResume([a, b], 'K', f);
    const parts = JSON.parse(f.mock.calls[0]![1].body).contents[0].parts;
    expect(parts.slice(0, 2).map((x: { inline_data: { data: string } }) => x.inline_data.data)).toEqual([a.dataBase64, b.dataBase64]);
    expect(parts[2].text).toContain('versions of one candidate');
    expect(p.githubUrl).toBe('https://github.com/ada');
    expect(p.linkedinUrl).toBe('https://www.linkedin.com/in/ada');
    f.mockClear();
    await parseResume(pdf, 'K', f);
    expect(JSON.parse(f.mock.calls[0]![1].body).contents[0].parts[1].text).not.toContain('versions of one candidate');
  });
  it('versions too large together -> too_large without calling fetch', async () => {
    const f = vi.fn();
    const half = { ...pdf, dataBase64: 'A'.repeat(Math.ceil((MAX_RESUME_BYTES * 0.6) / 3) * 4) };
    await expect(parseResume([half, { ...half, name: 'b.pdf' }], 'K', f)).rejects.toMatchObject({ code: 'too_large' });
    expect(f).not.toHaveBeenCalled();
  });
  it('infers mime type from extension when file.type is empty', async () => {
    const f = vi.fn().mockResolvedValue(ok({ firstName: 'Ada' }));
    await parseResume({ ...pdf, type: '' }, 'K', f);
    const [, init] = f.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('application/pdf');
  });
  it('non-JSON model text -> bad_response', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nope' }] } }] })));
    await expect(parseResume(pdf, 'K', f)).rejects.toBeInstanceOf(ResumeParseError);
  });
  it('fetch throws -> network', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code: 'network' });
  });
});
