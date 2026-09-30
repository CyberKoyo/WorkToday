import { describe, it, expect } from 'vitest';
import { validateMapRequest, MAX_FIELDS, PROFILE_KEYS } from '../src';

const field = { id: 'wf-0', label: 'First Name', kind: 'text', required: true };

describe('validateMapRequest', () => {
  it('accepts a valid request and strips unknown props', () => {
    const r = validateMapRequest({ fields: [{ ...field, secret: 'x', section: 'My Information' }] });
    expect(r).toEqual({ ok: true, value: { fields: [{ id: 'wf-0', label: 'First Name', kind: 'text', required: true, section: 'My Information' }] } });
  });
  it('rejects non-object and missing fields', () => {
    expect(validateMapRequest(null).ok).toBe(false);
    expect(validateMapRequest({}).ok).toBe(false);
    expect(validateMapRequest({ fields: [] }).ok).toBe(false);
  });
  it('rejects too many fields', () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ ...field, id: `wf-${i}` }));
    expect(validateMapRequest({ fields }).ok).toBe(false);
  });
  it('rejects bad id, kind, label, options', () => {
    expect(validateMapRequest({ fields: [{ ...field, id: 'x' }] }).ok).toBe(false);
    expect(validateMapRequest({ fields: [{ ...field, kind: 'weird' }] }).ok).toBe(false);
    expect(validateMapRequest({ fields: [{ ...field, label: 'a'.repeat(301) }] }).ok).toBe(false);
    expect(validateMapRequest({ fields: [{ ...field, options: [1] }] }).ok).toBe(false);
  });
  it('exposes the key list including repeat-group keys', () => {
    expect(PROFILE_KEYS).toContain('firstName');
    expect(PROFILE_KEYS).toContain('work.title');
    expect(PROFILE_KEYS).toContain('resumeFile');
  });
});
