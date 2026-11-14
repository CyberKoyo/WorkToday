import { getApiKey, getApplications, getLoopSettings, getProfile, getResume, getResumes, getSavedAnswers, getSheet, saveApiKey, saveLoopSettings, saveProfile, saveResumes } from '@/src/storage/store';
import { fileToStored, type StoredFile } from '@/src/storage/fileCodec';
import { keyWorks, parseResume, ResumeParseError } from '@/src/gemini/parseResume';
import { connectSheet, sheetsConfigured } from '@/src/sheets/sheets';
import { ALL_SITES, type BgMessage, type SyncReply } from '@/src/messages';
import { renderProfileForm, readProfileForm } from '@/src/options/profileForm';
import { keepManualAnswers } from '@/src/options/mergeManual';
import { emptyProfile } from '@/src/profile/profile';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => { $('status').textContent = msg; };
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// One section on screen at a time, picked by the address (#profile, #settings); anything else is the dashboard.
function route() {
  const sections = [...document.querySelectorAll<HTMLElement>('main > section')];
  const id = sections.find((s) => `#${s.id}` === location.hash)?.id ?? 'dashboard';
  for (const s of sections) s.hidden = s.id !== id;
  for (const a of document.querySelectorAll('nav a')) {
    if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

const cell = (...kids: Array<Node | string>) => { const td = document.createElement('td'); td.append(...kids); return td; };

async function renderDashboard() {
  const [apps, answers, key, resume, profile, sheet] = await Promise.all(
    [getApplications(), getSavedAnswers(), getApiKey(), getResume(), getProfile(), getSheet()]);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toLocaleDateString('en-CA');
  $('statApps').textContent = String(apps.length);
  $('statWeek').textContent = String(apps.filter((a) => a.date > weekAgo).length);
  $('statAnswers').textContent = String(Object.keys(answers).length);
  $('statProfile').textContent = profile?.reviewed ? '✓ Reviewed' : profile ? '⚠ Needs review' : '○ Not set up';

  const steps: Array<[string, boolean, string]> = [
    ['Add your Gemini API key', !!key, '#settings'],
    ['Upload your resume', !!resume, '#profile'],
    ['Review and save your profile', !!profile?.reviewed, '#profile'],
  ];
  $('setup').hidden = steps.every(([, done]) => done);
  $('setupSteps').replaceChildren(...steps.map(([text, done, href]) => {
    const li = document.createElement('li');
    li.append(done ? '✓ ' : '○ ', done ? text : Object.assign(document.createElement('a'), { href, textContent: text }), done ? ' (done)' : '');
    return li;
  }));

  // Newest first. Names come from page titles: text only, never markup.
  $('apps').replaceChildren(...[...apps].reverse().map((a) => {
    const tr = document.createElement('tr');
    const link = Object.assign(document.createElement('a'), { href: a.url, textContent: a.name, target: '_blank', rel: 'noopener' });
    tr.append(cell(link), cell(a.date), cell(new URL(a.url).hostname));
    return tr;
  }));
  $('appsEmpty').hidden = apps.length > 0;

  const waiting = apps.filter((a) => !a.synced).length;
  $<HTMLButtonElement>('sheetBtn').disabled = !sheetsConfigured;
  $('sheetBtn').textContent = sheet.id ? 'Sync now' : 'Connect Google Sheets';
  $('sheetLink').hidden = !sheet.url;
  if (sheet.url) $<HTMLAnchorElement>('sheetLink').href = sheet.url;
  $('sheetNote').textContent = !sheetsConfigured ? 'Google Sheets sync is not set up in this build (see "Google Sheets" in the README). Applications are still logged here.'
    : !sheet.id ? 'Connect once and each application is added to a "Job Applications" spreadsheet in your Google Drive.'
    : waiting ? `${waiting} not in your sheet yet. Press Sync now.` : 'Your sheet is up to date.';
}

$('sheetBtn').onclick = async () => {
  $<HTMLButtonElement>('sheetBtn').disabled = true;
  try {
    await connectSheet();
    const reply = (await browser.runtime.sendMessage({ type: 'sync-sheet' } satisfies BgMessage)) as SyncReply;
    status(reply?.ok ? 'Google Sheet is up to date.' : reply?.message ?? 'Could not update the sheet.');
  } catch (e) {
    status(`Google Sheets: ${errorMessage(e)}`);
  }
  await renderDashboard();
};

async function init() {
  route();
  window.addEventListener('hashchange', route);
  await renderDashboard();
  browser.storage.onChanged.addListener(() => { void renderDashboard(); }); // an application logged in another tab shows up live
  $<HTMLInputElement>('apiKey').value = await getApiKey();
  await renderAllowed();
  const loop = await getLoopSettings();
  $<HTMLInputElement>('loopEmail').value = loop.email;
  $<HTMLInputElement>('loopPassword').value = loop.password;
  $<HTMLInputElement>('loopSubmit').checked = loop.submit;
  await renderResumes();
  const profile = await getProfile();
  renderProfileForm($('form'), profile ?? emptyProfile());
  if (profile && !profile.reviewed) status('Profile not reviewed yet — review and save.');
}

// The stored resume versions. The first is the file attached to applications; any other can take its place.
async function renderResumes() {
  const list = await getResumes();
  const button = (text: string, label: string, next: () => StoredFile[], done: string) => {
    const b = Object.assign(document.createElement('button'), {
      type: 'button', textContent: text, onclick: async () => { await saveResumes(next()); await renderResumes(); status(done); },
    });
    b.setAttribute('aria-label', label); // the visible text alone does not say which file
    return b;
  };
  $('resumes').replaceChildren(...list.map((r, i) => {
    const li = document.createElement('li');
    li.append(r.name, i ? ' ' : ' (attached to applications) ');
    if (i) li.append(button('Attach this one', `Attach ${r.name} to applications`, () => [r, ...list.filter((x) => x !== r)], `${r.name} is now attached to applications.`), ' ');
    li.append(button('Remove', `Remove ${r.name}`, () => list.filter((x) => x !== r), `Removed ${r.name}. Press Read resumes to rebuild the profile without it.`));
    return li;
  }));
  $('resumeName').textContent = list.length ? '' : 'No resume stored.';
}

$('saveKey').onclick = async () => {
  const key = $<HTMLInputElement>('apiKey').value.trim();
  try {
    await saveApiKey(key);
    status('Key saved. Checking it with Google…');
    status(!key ? 'Key removed.' : (await keyWorks(key)) ? 'Key saved. Google accepts it.' : 'Key saved, but Google rejects it. Copy it again from AI Studio.');
  } catch (e) {
    status(`Could not save: ${errorMessage(e)}`);
  }
};

// The button says where things stand: the browser's own prompt is the only other sign that anything happened.
async function renderAllowed() {
  const allowed = await browser.permissions.contains(ALL_SITES);
  $<HTMLButtonElement>('loopAllow').disabled = allowed;
  $('loopAllow').textContent = allowed ? '✓ Allowed on all sites' : 'Allow on all sites';
}

// Asked here because the browser only shows its permission prompt from a click on an extension page.
$('loopAllow').onclick = async () => {
  status((await browser.permissions.request(ALL_SITES)) ? 'Allowed. Reload any application already open; start the job loop from the toolbar button on a job board.' : 'Not allowed.');
  await renderAllowed();
};

$('saveLoop').onclick = async () => {
  const s = { email: $<HTMLInputElement>('loopEmail').value.trim(), password: $<HTMLInputElement>('loopPassword').value, submit: $<HTMLInputElement>('loopSubmit').checked };
  try {
    await saveLoopSettings(s);
    status(`Job loop saved. ${s.submit ? 'It will submit applications for you.' : 'It fills and leaves submitting to you.'}`);
  } catch (e) {
    status(`Could not save: ${errorMessage(e)}`);
  }
};

// Pasting is enough; the value is in the box once the paste event has finished.
$('apiKey').onpaste = () => { setTimeout(() => $('saveKey').click()); };

$('parse').onclick = async () => {
  $<HTMLButtonElement>('parse').disabled = true;
  try {
    const added = await Promise.all([...($<HTMLInputElement>('resume').files ?? [])].map(fileToStored));
    // A file added again replaces its older copy. With none chosen, the stored ones are read again (after a removal).
    const all = [...(await getResumes()).filter((r) => !added.some((a) => a.name === r.name)), ...added];
    if (!all.length) return status('Choose a resume file first.');
    status('Parsing with Gemini…');
    const typedKey = $<HTMLInputElement>('apiKey').value.trim();
    const storedKey = await getApiKey();
    if (typedKey && typedKey !== storedKey) await saveApiKey(typedKey);
    const apiKey = typedKey || storedKey;
    const parsed = await parseResume(all, apiKey);
    await saveResumes(all);                      // only persist after a successful parse
    $<HTMLInputElement>('resume').value = '';
    await renderResumes();
    renderProfileForm($('form'), keepManualAnswers(parsed, readProfileForm($('form'))));
    if (!parsed.firstName && !parsed.email && parsed.work.length === 0) {
      status('Gemini found almost nothing in this file — is it a scanned image or not a resume? Review carefully.');
    } else {
      status('Parsed. Review below, then Save.');  // profile not saved until the user clicks Save
    }
  } catch (e) {
    status(e instanceof ResumeParseError ? e.message : 'Unexpected error while parsing.');
  } finally {
    $<HTMLButtonElement>('parse').disabled = false;
  }
};

$('save').onclick = async () => {
  const data = readProfileForm($('form'));
  if (!data.firstName && !data.lastName && !data.email) {
    return status('Add at least your name or email before saving.');
  }
  try {
    await saveProfile({ ...data, reviewed: true });
    status('Saved. Auto-fill is ready.');
  } catch (e) {
    status(`Could not save: ${errorMessage(e)}`);
  }
};

$<HTMLButtonElement>('save').disabled = true;
$<HTMLButtonElement>('parse').disabled = true;
init()
  .then(() => {
    $<HTMLButtonElement>('save').disabled = false;
    $<HTMLButtonElement>('parse').disabled = false;
  })
  .catch((e) => {
    status(`Could not load saved data: ${errorMessage(e)}`);
  });
