import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readDocx } from '../../src/resume/docx';

const docx = () => new Uint8Array(readFileSync(`${__dirname}/../fixtures/resume.synthetic.docx`));

describe('readDocx', () => {
  it('reads the header (stored) before the body (deflated), a line per paragraph', async () => {
    expect((await readDocx(docx())).text).toBe([
      'Ada Lovelace', 'ada@example.com', '555-0100', '',
      'Experience', 'Software Engineer, Acme & Co\t2021-03 – Present', 'Portfolio', 'GitHub',
    ].join('\n'));
  });
  it('lists external hyperlink targets only', async () => {
    expect((await readDocx(docx())).links).toEqual(['https://github.com/ada?tab=repositories&x=1']);
  });
  it('rejects a file that is not a zip', async () => {
    await expect(readDocx(new Uint8Array(100))).rejects.toThrow('not a zip file');
  });
});
