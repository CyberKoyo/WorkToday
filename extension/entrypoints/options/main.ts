import { getApiKey, getProfile, getResume, saveApiKey, saveProfile, saveResume } from '@/src/storage/store';
import { fileToStored } from '@/src/storage/fileCodec';
import { parseResume, ResumeParseError } from '@/src/gemini/parseResume';
import { renderProfileForm, readProfileForm } from '@/src/options/profileForm';
import { keepManualAnswers } from '@/src/options/mergeManual';
import { emptyProfile } from '@/src/profile/profile';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => { $('status').textContent = msg; };
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function init() {
  $<HTMLInputElement>('apiKey').value = await getApiKey();
  const resume = await getResume();
  $('resumeName').textContent = resume ? `Stored: ${resume.name}` : 'No resume stored.';
  const profile = await getProfile();
  renderProfileForm($('form'), profile ?? emptyProfile());
  if (profile && !profile.reviewed) status('Profile not reviewed yet — review and save.');
}

$('saveKey').onclick = async () => {
  try {
    await saveApiKey($<HTMLInputElement>('apiKey').value);
    status('Key saved.');
  } catch (e) {
    status(`Could not save: ${errorMessage(e)}`);
  }
};

$('parse').onclick = async () => {
  const file = $<HTMLInputElement>('resume').files?.[0];
  if (!file) return status('Choose a resume file first.');
  $<HTMLButtonElement>('parse').disabled = true;
  status('Parsing with Gemini…');
  try {
    const typedKey = $<HTMLInputElement>('apiKey').value.trim();
    const storedKey = await getApiKey();
    if (typedKey && typedKey !== storedKey) await saveApiKey(typedKey);
    const apiKey = typedKey || storedKey;
    const stored = await fileToStored(file);
    const parsed = await parseResume(stored, apiKey);
    await saveResume(stored);                    // only persist after a successful parse
    $('resumeName').textContent = `Stored: ${stored.name}`;
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
    status('Saved. Auto-fill is ready on Workday.');
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
