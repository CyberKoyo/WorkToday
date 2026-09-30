import { getApiKey, getProfile, getResume, saveApiKey, saveProfile, saveResume } from '@/src/storage/store';
import { fileToStored } from '@/src/storage/fileCodec';
import { parseResume, ResumeParseError } from '@/src/gemini/parseResume';
import { renderProfileForm, readProfileForm } from '@/src/options/profileForm';
import { keepManualAnswers } from '@/src/options/mergeManual';
import { emptyProfile } from '@/src/profile/profile';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => { $('status').textContent = msg; };

async function init() {
  $<HTMLInputElement>('apiKey').value = await getApiKey();
  const resume = await getResume();
  $('resumeName').textContent = resume ? `Stored: ${resume.name}` : 'No resume stored.';
  const profile = await getProfile();
  renderProfileForm($('form'), profile ?? emptyProfile());
  if (profile && !profile.reviewed) status('Profile not reviewed yet — review and save.');
}

$('saveKey').onclick = async () => { await saveApiKey($<HTMLInputElement>('apiKey').value); status('Key saved.'); };

$('parse').onclick = async () => {
  const file = $<HTMLInputElement>('resume').files?.[0];
  if (!file) return status('Choose a resume file first.');
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
    status('Parsed. Review below, then Save.');  // profile not saved until the user clicks Save
  } catch (e) {
    status(e instanceof ResumeParseError ? e.message : 'Unexpected error while parsing.');
  }
};

$('save').onclick = async () => {
  await saveProfile({ ...readProfileForm($('form')), reviewed: true });
  status('Saved. Auto-fill is ready on Workday.');
};

init();
