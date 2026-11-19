// Gemini takes PDF and text but not Word, so a .docx resume is sent as its text.
// A .docx is a zip of XML parts: the body, headers/footers (often the contact line) and their link targets.

const u16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32 = (b: Uint8Array, i: number) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Zip entries whose name passes `want`, as UTF-8 text. shortcut: no Zip64, fine for files under 4 GB. */
export async function readZip(zip: Uint8Array, want: (name: string) => boolean): Promise<Map<string, string>> {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (u32(zip, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const out = new Map<string, string>();
  const utf8 = new TextDecoder();
  for (let p = u32(zip, eocd + 16), n = u16(zip, eocd + 10); n > 0; n--) {
    if (u32(zip, p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = u16(zip, p + 10), size = u32(zip, p + 20), nameLen = u16(zip, p + 28);
    const name = utf8.decode(zip.subarray(p + 46, p + 46 + nameLen));
    const local = u32(zip, p + 42);
    p += 46 + nameLen + u16(zip, p + 30) + u16(zip, p + 32);
    if (!want(name)) continue;
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    const raw = zip.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip method ${method}`);
    out.set(name, utf8.decode(method === 8 ? await inflateRaw(raw) : raw));
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/** The visible text of one WordprocessingML part, a line per paragraph. */
export function partText(xml: string): string {
  // Only <w:t> runs are text: whitespace between tags, field codes (HYPERLINK "…") and tracked deletions are not on the page.
  const text = [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>|<\/w:p>/g)]
    .map(([, t, tag]) => (t !== undefined ? unescapeXml(t) : tag === 'tab' ? '\t' : '\n')).join('');
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const PART = /^word\/(document|header\d*|footer\d*)\.xml$/;
const RELS = /^word\/_rels\/(document|header\d*|footer\d*)\.xml\.rels$/;

/** Text (headers first, as on the page) and external link targets of a .docx. */
export async function readDocx(bytes: Uint8Array): Promise<{ text: string; links: string[] }> {
  const parts = await readZip(bytes, (n) => PART.test(n) || RELS.test(n));
  const names = [...parts.keys()].filter((n) => PART.test(n));
  const order = (n: string) => (n.includes('header') ? 0 : n.includes('document') ? 1 : 2);
  const text = names.sort((a, b) => order(a) - order(b)).map((n) => partText(parts.get(n)!)).filter(Boolean).join('\n\n');
  const links = [...parts].filter(([n]) => RELS.test(n)).flatMap(([, xml]) =>
    [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
      .filter((r) => /Type="[^"]*\/hyperlink"/.test(r) && /TargetMode="External"/.test(r))
      .map((r) => unescapeXml(r.match(/Target="([^"]*)"/)?.[1] ?? '').trim()).filter(Boolean));
  return { text, links };
}
