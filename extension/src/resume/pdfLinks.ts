import type { Profile } from '../profile/profile';

// Resumes often show "GitHub" / "LinkedIn" as link text, with the real URL only in a
// PDF link annotation. Gemini reads the rendered page and never sees it, so we pull
// URI actions out of the PDF bytes ourselves.

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };

// Reads a PDF literal "(...)" or hex "<...>" string starting at s[i].
function readPdfString(s: string, i: number): string | null {
  if (s[i] === '<') {
    const end = s.indexOf('>', i);
    if (end < 0) return null;
    const hex = s.slice(i + 1, end).replace(/\s/g, '');
    let out = '';
    for (let j = 0; j < hex.length; j += 2) out += String.fromCharCode(parseInt(hex.slice(j, j + 2).padEnd(2, '0'), 16));
    return out;
  }
  if (s[i] !== '(') return null;
  let out = '';
  let depth = 1;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j]!;
    if (c === '\\') { const n = s[++j] ?? ''; out += ESCAPES[n] ?? n; continue; }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) return out;
    out += c;
  }
  return null;
}

function urisIn(s: string): string[] {
  const found: string[] = [];
  for (const m of s.matchAll(/\/URI\s*(?=[(<])/g)) {
    const uri = readPdfString(s, m.index + m[0].length);
    if (uri) found.push(uri.trim());
  }
  return found;
}

// windows-1252 decoding keeps one char per byte, so string indices match byte offsets.
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

async function inflate(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return latin1(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function extractPdfLinks(pdf: Uint8Array): Promise<string[]> {
  const text = latin1(pdf);
  const uris = urisIn(text);
  // Link annotations can also live inside compressed object streams (PDF 1.5+).
  for (const m of text.matchAll(/<<((?:(?!>>\s*stream)[\s\S])*?\/ObjStm[\s\S]*?)>>\s*stream\r?\n/g)) {
    if (!m[1]!.includes('/FlateDecode')) continue;
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    let stop = end;
    while (stop > start && (text[stop - 1] === '\n' || text[stop - 1] === '\r')) stop--;
    try { uris.push(...urisIn(await inflate(pdf.subarray(start, stop)))); } catch { /* corrupt stream: skip */ }
  }
  return [...new Set(uris.filter((u) => /^https?:\/\//i.test(u)))];
}

const LINK_FIELDS = ['githubUrl', 'linkedinUrl', 'websiteUrl'] as const;
const LOOKS_LIKE_URL = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;
const HOST_FOR: Partial<Record<(typeof LINK_FIELDS)[number], RegExp>> = {
  githubUrl: /^https?:\/\/(www\.)?github\.com\//i,
  linkedinUrl: /^https?:\/\/([\w-]+\.)?linkedin\.com\//i,
};

// Drops link text the model copied instead of a URL ("Github"), then fills blanks from PDF links.
export function fillLinkFields(p: Profile, links: string[]): void {
  for (const k of LINK_FIELDS) {
    if (!LOOKS_LIKE_URL.test(p[k])) p[k] = '';
    const host = HOST_FOR[k];
    if (!p[k] && host) p[k] = links.find((l) => host.test(l)) ?? '';
  }
}
