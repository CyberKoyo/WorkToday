import { describe, it, expect } from 'vitest';

describe('worker entry module', () => {
  it('exports only the default handler (workerd rejects non-handler named exports)', async () => {
    expect(Object.keys(await import('../src/index'))).toEqual(['default']);
  });
});
