import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { extractPdfLinks, fillLinkFields } from '../../src/resume/pdfLinks';
import { emptyProfile } from '../../src/profile/profile';

const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('extractPdfLinks', () => {
  it('finds URI actions in plain annotation objects', async () => {
    const pdf = bytes('5 0 obj<</Type/Annot/A<</S/URI/URI(https://github.com/ada)>>>>endobj\n'
      + '6 0 obj<</A<</URI (https://www.linkedin.com/in/ada-l/) /S /URI>>>>endobj');
    expect(await extractPdfLinks(pdf)).toEqual(['https://github.com/ada', 'https://www.linkedin.com/in/ada-l/']);
  });
  it('decodes hex strings and escaped parentheses', async () => {
    const hex = Buffer.from('https://ada.dev/').toString('hex');
    const pdf = bytes(`<</URI<${hex}>>> <</URI(https://x.io/a\\(b\\))>>`);
    expect(await extractPdfLinks(pdf)).toEqual(['https://ada.dev/', 'https://x.io/a(b)']);
  });
  it('finds URIs inside Flate-compressed object streams', async () => {
    const inner = deflateSync(Buffer.from('<</S/URI/URI(https://github.com/zipped)>>'));
    const pdf = Buffer.concat([
      Buffer.from('7 0 obj<</Type/ObjStm/Filter/FlateDecode/Length ' + inner.length + '>>stream\n'),
      inner, Buffer.from('\nendstream endobj'),
    ]);
    expect(await extractPdfLinks(new Uint8Array(pdf))).toEqual(['https://github.com/zipped']);
  });
  it('dedupes and ignores mailto/non-http links and corrupt streams', async () => {
    const pdf = bytes('<</URI(mailto:a@b.c)>> <</URI(https://a.io)>> <</URI(https://a.io)>>'
      + '<</Filter/FlateDecode>>stream\nnot zlib\nendstream');
    expect(await extractPdfLinks(pdf)).toEqual(['https://a.io']);
  });
});

describe('fillLinkFields', () => {
  it('replaces non-URL link text with links from the PDF', () => {
    const p = { ...emptyProfile(), githubUrl: 'Github', linkedinUrl: 'LinkedIn' };
    fillLinkFields(p, ['https://github.com/ada/ada', 'https://www.linkedin.com/in/ada-l/']);
    expect(p.githubUrl).toBe('https://github.com/ada/ada');
    expect(p.linkedinUrl).toBe('https://www.linkedin.com/in/ada-l/');
  });
  it('keeps URLs the model already found', () => {
    const p = { ...emptyProfile(), githubUrl: 'github.com/ada', websiteUrl: 'https://ada.dev' };
    fillLinkFields(p, ['https://github.com/other']);
    expect(p.githubUrl).toBe('github.com/ada');
    expect(p.websiteUrl).toBe('https://ada.dev');
  });
  it('clears non-URL text when no matching link exists', () => {
    const p = { ...emptyProfile(), githubUrl: 'Github', websiteUrl: 'Portfolio' };
    fillLinkFields(p, []);
    expect(p.githubUrl).toBe('');
    expect(p.websiteUrl).toBe('');
  });
});
