import '@/src/ui/page.css';
import { forgetSecrets, setPassphrase, getAccountPassword, saveAccountPassword, getApiKey, getApplications, getCertProofs, getLoopSettings, getProfile, getResume, getResumes, getSavedAnswers, getSheet, saveApiKey, saveCertProofs, saveLoopSettings, saveProfile, saveResumes } from '@/src/storage/store';
import { fileToStored, type StoredFile } from '@/src/storage/fileCodec';
import { getApplications as getTracked } from '@/src/tracker/store';
import { keyWorks, parseResume, ResumeParseError } from '@/src/gemini/parseResume';
import { connectSheet, sheetsConfigured } from '@/src/sheets/sheets';
import { ALL_SITES, type BgMessage, type SyncReply } from '@/src/messages';
import { renderProfileForm, readProfileForm, readCertProofs } from '@/src/options/profileForm';
import { keepManualAnswers } from '@/src/options/mergeManual';
import { emptyProfile } from '@/src/profile/profile';
import { lock, unlock, vaultState } from '@/src/storage/vault';

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
  const apps = await getApplications(); // first and alone: it moves old tracker rows out, once
  const [tracked, answers, key, resume, profile, sheet, vault] = await Promise.all(
    [getTracked(), getSavedAnswers(), getApiKey(), getResume(), getProfile(), getSheet(), vaultState()]);
  // The Applications log holds every application: typed in, imported, or copied from what Auto-fill logged (copyLogged).
  const all = tracked.map((a, i) => ({ ...a, i })).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i); // newest first; same day, last added first
  const weekAgo = new Date(Date.now() - 7 * 864e5).toLocaleDateString('en-CA');
  $('statApps').textContent = String(all.length);
  $('statWeek').textContent = String(all.filter((a) => a.date > weekAgo).length);
  $('statAnswers').textContent = String(Object.keys(answers).length);
  $('statProfile').textContent = profile?.reviewed ? '✓ Reviewed' : profile ? '⚠ Needs review' : '○ Not set up';

  const steps: Array<[string, boolean, string]> = [
    ...(vault === 'locked' ? [['Unlock your saved secrets', false, '#settings'] as [string, boolean, string]] : []),
    ['Add your Gemini API key', !!key || vault === 'locked', '#settings'], // locked reads as empty, not as missing
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
  $('apps').replaceChildren(...all.map((a) => {
    const tr = document.createElement('tr');
    const link = a.url ? Object.assign(document.createElement('a'), { href: a.url, textContent: a.title, target: '_blank', rel: 'noopener' }) : a.title;
    const edit = Object.assign(document.createElement('a'), { href: `/tracker.html?edit=${encodeURIComponent(a.id)}`, textContent: 'Edit' });
    edit.setAttribute('aria-label', `Edit ${a.title}`);
    tr.append(cell(link), cell(a.company), cell(a.date), cell(a.location || (a.url ? new URL(a.url).hostname : '')), cell(a.status ?? ''), cell(edit));
    return tr;
  }));
  $('appsEmpty').hidden = all.length > 0;

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
  await fillSecrets();
  await renderAllowed();
  await renderVault();
  await renderResumes();
  const profile = await getProfile();
  renderProfileForm($('form'), profile ?? emptyProfile(), await getCertProofs());
  if (profile && !profile.reviewed) status('Profile not reviewed yet — review and save.');
}

// The boxes that show saved secrets: empty while they are locked (and saving then refuses, so nothing is overwritten).
async function fillSecrets() {
  $<HTMLInputElement>('apiKey').value = await getApiKey();
  $<HTMLInputElement>('accountPassword').value = await getAccountPassword();
  const loop = await getLoopSettings();
  $<HTMLInputElement>('loopEmail').value = loop.email;
  $<HTMLInputElement>('loopPassword').value = loop.password;
  $<HTMLInputElement>('loopSubmit').checked = loop.submit;
}

async function renderVault() {
  const state = await vaultState();
  $('vaultState').textContent = state === 'off' ? 'No passphrase: the key and passwords are stored unencrypted.'
    : state === 'locked' ? 'Locked. Enter your passphrase and press Unlock.' : 'Locked with a passphrase, and unlocked until the browser closes.';
  $('vaultSet').textContent = state === 'off' ? 'Set passphrase' : 'Change passphrase';
  $('vaultSet').hidden = state === 'locked';
  $('vaultUnlock').hidden = state !== 'locked';
  $('vaultLock').hidden = $('vaultOff').hidden = state !== 'unlocked';
  $('vaultForget').hidden = state !== 'locked';
}

const passphrase = () => $<HTMLInputElement>('passphrase');
const vaultAction = (run: () => Promise<string | void>) => async () => {
  try { const done = await run(); if (done) status(done); } catch (e) { status(errorMessage(e)); }
  passphrase().value = '';
  await fillSecrets();
  await renderVault();
  await renderDashboard();
};
$('vaultSet').onclick = vaultAction(async () => {
  if (passphrase().value.length < 10) return 'Use a passphrase of at least 10 characters.';
  await setPassphrase(passphrase().value);
  return 'Passphrase set. Your key and passwords are stored encrypted.';
});
$('vaultUnlock').onclick = vaultAction(async () => ((await unlock(passphrase().value)) ? 'Unlocked.' : 'Wrong passphrase.'));
$('vaultLock').onclick = vaultAction(async () => { await lock(); return 'Locked.'; });
$('vaultOff').onclick = vaultAction(async () => {
  if (!confirm('Remove the passphrase? Your key and passwords will be stored unencrypted again.')) return;
  await setPassphrase('');
  return 'Passphrase removed.';
});
$('vaultForget').onclick = vaultAction(async () => {
  if (!confirm('Clear the locked Gemini key and passwords? Enter them again afterwards. Your profile, resumes and log stay.')) return;
  await forgetSecrets();
  return 'Cleared. Enter your Gemini key and passwords again.';
});

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
    const added = r.addedAt ? `, uploaded ${new Date(r.addedAt).toLocaleDateString('en-CA')}` : '';
    li.append(`${r.name}${added}`, i ? ' ' : ' (attached to applications) ');
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

$('savePassword').onclick = async () => {
  try {
    await saveAccountPassword($<HTMLInputElement>('accountPassword').value);
    status('Account password saved.');
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

$('wipe').onclick = async () => {
  if (!confirm('Delete your profile, resumes, API key, passwords, saved answers and applications log from this browser? This cannot be undone.')) return;
  try {
    await browser.storage.local.clear(); // the extension keeps nothing anywhere else but the unlocked key
    await browser.storage.session.clear();
    location.reload(); // every box on this page still shows the old values
  } catch (e) {
    status(`Could not delete: ${errorMessage(e)}`);
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
    renderProfileForm($('form'), keepManualAnswers(parsed, readProfileForm($('form'))), await getCertProofs());
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
    await saveCertProofs(await readCertProofs($('form'), await getCertProofs()));
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
