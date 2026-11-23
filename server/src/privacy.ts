import policy from '../../store/PRIVACY.md';

// Just the markdown PRIVACY.md uses: # and ## headings, "- " lists with wrapped lines, **bold**, wrapped paragraphs.
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return md.trim().split(/\n\s*\n/).map((block) => {
    const h = /^(#{1,2}) (.*)$/.exec(block);
    if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    if (block.startsWith('- ')) {
      return `<ul>${block.split(/\n- /).map((li) => `<li>${inline(li.replace(/^- /, '').replace(/\s*\n\s*/g, ' '))}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(block.replace(/\s*\n\s*/g, ' '))}</p>`;
  }).join('\n');
}

export const privacyPage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Job Application Filler — Privacy Policy</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem 16px;color:#1a1a1a;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6e6e6;background:#161616}}</style></head>
<body>${markdownToHtml(policy)}</body></html>`;
