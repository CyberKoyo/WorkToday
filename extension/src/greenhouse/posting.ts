// Greenhouse's public job board API (no key, open to browsers): the posting for a board and job id.
const API = 'https://boards-api.greenhouse.io/v1/boards';

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, e: string) => (
  e[0] !== '#' ? ENTITY[e.toLowerCase()] ?? ' ' : String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1)))));

/**
 * The job posting's text for a Greenhouse application at `url`: '' for any other address, or when Greenhouse has none.
 * An embedded form (a company's own careers page) sits alone in a frame, with no description for an essay draft to
 * draw on (live MongoDB). Runs in the background, which has no DOM: the HTML is reduced to text by hand.
 */
export async function greenhousePosting(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let u: URL;
  try { u = new URL(url); } catch { return ''; }
  if (!/(^|\.)greenhouse\.io$/.test(u.hostname)) return '';
  // Embedded: /embed/job_app?for=<board>&token=<id>. Hosted: /<board>/jobs/<id>.
  const [board, id] = u.searchParams.get('for') ? [u.searchParams.get('for'), u.searchParams.get('token')]
    : u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/)?.slice(1) ?? [];
  if (!board || !id) return '';
  const res = await fetchImpl(`${API}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`);
  if (!res.ok) return '';
  const job = (await res.json()) as { title?: unknown; content?: unknown; location?: { name?: unknown } };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  // `content` is HTML with its tags escaped: unescape, drop the tags, then decode what the text itself held.
  const text = decode(decode(str(job.content)).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return [str(job.title), str(job.location?.name), text].filter(Boolean).join('\n');
}
