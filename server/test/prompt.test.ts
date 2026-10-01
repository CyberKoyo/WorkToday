import { describe, it, expect } from 'vitest';
import { buildMessages } from '../src/prompt';
import { KEY_DESCRIPTIONS } from '../src/keys';
import { PROFILE_KEYS } from '@wf/shared';

describe('buildMessages', () => {
  it('system lists every key; user carries only field descriptors', () => {
    const [sys, user] = buildMessages({ fields: [{ id: 'wf-0', label: 'Email Address', kind: 'text', required: true, section: 'My Information' }] });
    for (const k of PROFILE_KEYS) expect(sys.content).toContain(k);
    expect(JSON.parse(user.content)).toEqual([{ id: 'wf-0', label: 'Email Address', kind: 'text', section: 'My Information' }]);
  });
  it('has a description for every key', () => {
    expect(Object.keys(KEY_DESCRIPTIONS).sort()).toEqual([...PROFILE_KEYS].sort());
  });
});
