import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../src/background/handleMessage';
import { MapError } from '../../src/api/mapClient';

describe('handleMessage', () => {
  it('map-fields ok', async () => {
    const mapFields = vi.fn().mockResolvedValue(new Map([['wf-0', 'email']]));
    expect(await handleMessage({ type: 'map-fields', fields: [] }, { mapFields })).toEqual({ ok: true, mappings: [['wf-0', 'email']] });
  });
  it('map-fields error -> code', async () => {
    const mapFields = vi.fn().mockRejectedValue(new MapError('rate_limited', 'x'));
    expect(await handleMessage({ type: 'map-fields', fields: [] }, { mapFields })).toEqual({ ok: false, code: 'rate_limited' });
  });
  it('open-options', async () => {
    const openOptions = vi.fn().mockResolvedValue(undefined);
    await handleMessage({ type: 'open-options' }, { openOptions });
    expect(openOptions).toHaveBeenCalled();
  });
});
