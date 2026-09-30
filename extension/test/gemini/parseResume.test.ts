import { describe, it, expect, vi } from 'vitest';
import { parseResume, ResumeParseError, MAX_RESUME_BYTES } from '../../src/gemini/parseResume';

const pdf = { name: 'r.pdf', type: 'application/pdf', dataBase64: 'JVBERi0=' };
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe('parseResume', () => {
  it('sends inline file with key header and JSON schema; returns normalized profile', async () => {
    const f = vi.fn().mockResolvedValue(ok({ firstName: 'Ada', gender: 'female', work: [{ title: 'Eng', startDate: '2020-01' }] }));
    const p = await parseResume(pdf, 'KEY', f);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'application/pdf', data: 'JVBERi0=' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.gender).toBeUndefined();
    expect(p.firstName).toBe('Ada');
    expect(p.gender).toBe('');            // manual-only fields are discarded even if returned
    expect(p.work[0]!.title).toBe('Eng');
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
  it.each([[403, 'bad_key'], [429, 'rate_limited'], [500, 'bad_response']])('HTTP %i -> %s', async (status, code) => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(parseResume(pdf, 'K', f)).rejects.toMatchObject({ code });
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
  it('oversize resume -> too_large without calling fetch', async () => {
    const f = vi.fn();
    const bigBase64 = 'A'.repeat(Math.ceil((MAX_RESUME_BYTES + 1) / 3) * 4);
    await expect(parseResume({ ...pdf, dataBase64: bigBase64 }, 'K', f)).rejects.toMatchObject({ code: 'too_large' });
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
