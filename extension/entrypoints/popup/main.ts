import './style.css';
import { getApplications, updateApplication, type Application } from '@/src/tracker/store';
import { getProfile } from '@/src/storage/store';
import { pickAdapter } from '@/src/ats/registry';
import { injectManual } from '@/src/background/injectManual';
import { BUCKETS, countThisWeek, perDay, recent, statusCounts } from '@/src/popup/stats';

// The Applications log's statuses (tracker/index.html datalist).
const STATUSES = ['Applied', 'Assessment', 'Interview Scheduled', 'Interview Completed', 'Offer', 'Rejected', 'Withdrawn'];
const $ = (id: string) => document.getElementById(id)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const openPage = (path: string) => { void browser.tabs.create({ url: browser.runtime.getURL(path as '/options.html') }); window.close(); };

async function render() {
  const today = new Date();
  const apps = await getApplications();
  const counts = statusCounts(apps);
  const series = perDay(apps, today);
  const max = Math.max(1, ...series.map((d) => d.count));

  $('tiles').replaceChildren(...([['This week', countThisWeek(apps, today)], ['Total', apps.length], ['Interviews', counts.Interview], ['Offers', counts.Offer]] as const)
    .map(([label, n]) => el('div', { className: 'tile' }, el('b', { textContent: String(n) }), el('span', { textContent: label }))));

  $('bars').replaceChildren(...series.map((d) => {
    const bar = el('div', { title: `${d.date}: ${d.count}` });
    bar.style.height = `${Math.max(6, (d.count / max) * 100)}%`;
    bar.style.opacity = d.count ? '1' : '0.2';
    return bar;
  }));

  $('split').replaceChildren(...BUCKETS.filter((b) => counts[b]).map((b) => {
    const seg = el('div', { className: `s-${b}` });
    seg.style.flex = String(counts[b]);
    return seg;
  }));
  $('legend').replaceChildren(...BUCKETS.map((b) => el('span', {}, el('span', { className: `swatch s-${b}` }), b, ' ', el('b', { textContent: String(counts[b]) }))));

  $('empty').hidden = apps.length > 0;
  $('recent').replaceChildren(...recent(apps).map(row));
}

function row(a: Application) {
  const link = el('a', {},
    el('div', { className: 'co', textContent: a.company || a.title }),
    el('div', { className: 'sub' }, `${a.title} · `, el('time', { dateTime: a.date, textContent: a.date.slice(5) })));
  if (a.url) Object.assign(link, { href: a.url, target: '_blank', rel: 'noopener noreferrer' });
  const options = STATUSES.includes(a.status) ? STATUSES : [a.status || 'Applied', ...STATUSES]; // keep a status typed in the log
  const select = el('select', { ariaLabel: `Status for ${a.title} at ${a.company}` },
    ...options.map((s) => el('option', { textContent: s })));
  select.value = a.status || 'Applied';
  select.onchange = async () => { await updateApplication({ ...a, status: select.value }); await render(); };
  return el('li', {}, link, select);
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = (() => { try { return tab?.url ? new URL(tab.url) : null; } catch { return null; } })();
  const adapter = url && pickAdapter(url);
  const name = adapter && adapter.id !== 'generic' ? adapter.id[0]!.toUpperCase() + adapter.id.slice(1) : null;
  $('site').textContent = url?.protocol.startsWith('http') ? `${name ? `${name} detected` : 'Any form'} · ${url.hostname}` : 'Open a job application to auto-fill it';

  const fill = $('fill') as HTMLButtonElement;
  fill.disabled = tab?.id === undefined;
  fill.onclick = async () => {
    fill.disabled = true;
    $('fill-text').textContent = 'Opening Auto-fill…';
    await injectManual(tab!.id!); // the banner it shows on the page runs Auto-fill and Loop jobs, as the toolbar button did
    window.close();
  };

  if (!(await getProfile())) {
    $('ready').classList.add('off');
    $('ready-text').textContent = 'No profile yet';
  }
  $('settings').onclick = () => openPage('/options.html#settings');
  $('profile').onclick = () => openPage('/options.html#profile');
  $('tracker').onclick = () => openPage('/tracker.html');
  await render();
}

void init();
