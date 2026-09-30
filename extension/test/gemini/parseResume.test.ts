import { describe, it, expect, vi } from 'vitest';
import { parseResume, ResumeParseError } from '../../src/gemini/parseResume';

const pdf = { name: 'r.pdf', type: 'application/pdf', dataBase64: 'JVBERi0=' };
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe('parseResume', () => {
  it('sends inline file with key header and JSON schema; returns normalized profile', async () => {
    const f = vi.fn().mockResolvedValue(ok({ firstName: 'Ada', gender: 'female', work: [{ title: 'Eng', startDate: '2020-01' }] }));
    const p = await parseResume(pdf, 'KEY', f);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'application/pdf', data: 'JVBERi0=' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.gender).toBeUndefined();
    expect(p.firstName).toBe('Ada');
    expect(p.gender).toBe('');            // manual-only fields are discarded even if returned
    expect(p.work[0].title).toBe('Eng');
    expect(p.reviewed).toBe(false);
  });
  it('rejects docx without calling network', async () => {
    const f = vi.fn();
    await expect(parseResume({ ...pdf, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, 'K', f))
      .rejects.toMatchObject({ code: 'unsupported_type' });
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects missing key', async () => {
    await expect(parseResume(pdf, '', vi.fn())).rejects.toMatchObject({ code: 'bad_key' });
  });
  it.each([[400, 'bad_key'], [403, 'bad_key'], [429, 'rate_limited'], [500, 'bad_response']])('HTTP %i -> %s', async (status, code) => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code });
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
