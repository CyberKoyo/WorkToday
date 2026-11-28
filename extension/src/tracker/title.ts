// The job's title for the Applications log, where the tab title carries more than the job. Checked live, Nov 2026.
import { clean } from '../ats/field';

const meta = (doc: Document, p: string) => clean(doc.querySelector<HTMLMetaElement>(`meta[property="${p}"]`)?.content);

/** The job title the page states, or '' to keep the tab title. UKG: its title element (the tab says "Quick apply").
 * Otherwise og:title when the tab title opens with it, or the tab title less the site name the page appends to it when
 * og:title or og:site_name is that name (Oracle, on its own domains too: "<job> - Search Jobs - INL Interns Careers"). */
export function pageJobTitle(doc: Document): string {
  const ukg = clean(doc.querySelector('[data-automation="opportunity-title"]')?.textContent);
  if (ukg) return ukg;
  const tab = clean(doc.title);
  const og = meta(doc, 'og:title');
  if (og && tab.startsWith(`${og} - `)) return og; // og:title is the job (Oracle's job page)
  for (const site of [og, meta(doc, 'og:site_name')]) {
    if (site && tab.length > site.length + 3 && tab.endsWith(` - ${site}`)) return tab.slice(0, -site.length - 3);
  }
  return '';
}
