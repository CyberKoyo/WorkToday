import { browser } from 'wxt/browser';
import { getSheet, saveSheet, type Application } from '../storage/store';

// OAuth client ID (type "Web application") from the developer's Google Cloud project; see the README.
const CLIENT_ID: string = import.meta.env.WXT_GOOGLE_CLIENT_ID ?? '';
export const sheetsConfigured = !!CLIENT_ID;
// drive.file: only spreadsheets this extension created. Non-sensitive, so no Google security review.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const HEADER = ['Job application', 'Date applied', 'Job posting URL'];

// shortcut: implicit-flow tokens last an hour and renew without a prompt only while the browser is signed in to Google;
// rows wait locally until the next Sync. Move to a code flow with refresh tokens (needs a server secret) if that bites.
async function authorize(interactive: boolean): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google Sheets is not set up in this build.');
  const state = crypto.randomUUID();
  const back = await browser.identity.launchWebAuthFlow({
    interactive,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: CLIENT_ID, response_type: 'token', redirect_uri: browser.identity.getRedirectURL(), scope: SCOPE, state,
      ...(interactive ? {} : { prompt: 'none' }),
    })}`,
  });
  const reply = new URLSearchParams(new URL(back ?? '').hash.slice(1));
  const token = reply.get('access_token');
  if (!token || reply.get('state') !== state) throw new Error('Google sign-in did not complete.');
  await saveSheet({ ...(await getSheet()), token, expires: Date.now() + Number(reply.get('expires_in') ?? 3600) * 1000 });
  return token;
}

async function accessToken(interactive: boolean): Promise<string> {
  const s = await getSheet();
  return s.token && (s.expires ?? 0) > Date.now() + 60_000 ? s.token : authorize(interactive);
}

async function post(path: string, body: unknown, interactive = false): Promise<{ spreadsheetId?: string; spreadsheetUrl?: string }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(interactive)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();
  const s = await getSheet();
  // A revoked token or a deleted sheet would otherwise fail every sync from here on; drop it so Connect starts clean.
  if (res.status === 401) await saveSheet({ id: s.id, url: s.url });
  if (res.status === 404) await saveSheet({ token: s.token, expires: s.expires });
  throw new Error(res.status === 404 ? 'The spreadsheet is gone. Connect again to make a new one.'
    : res.status === 401 ? 'Google sign-in expired. Connect again.' : `Google Sheets error (HTTP ${res.status}).`);
}

// RAW, not USER_ENTERED: a page title starting with "=" must land as text, never run as a formula.
const append = (id: string, values: string[][], interactive = false) =>
  post(`/${id}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values }, interactive);

/** Sign in (a Google prompt when needed) and make the spreadsheet on first use. Call from a click on an extension page. */
export async function connectSheet(): Promise<void> {
  await accessToken(true);
  if ((await getSheet()).id) return;
  const made = await post('', { properties: { title: 'Job Applications' } }, true);
  if (!made.spreadsheetId) throw new Error('Google did not create the spreadsheet.');
  await saveSheet({ ...(await getSheet()), id: made.spreadsheetId, url: made.spreadsheetUrl });
  await append(made.spreadsheetId, [HEADER], true);
}

export const appendRows = async (rows: Application[]) =>
  append((await getSheet()).id!, rows.map((r) => [r.name, r.date, r.url]));
