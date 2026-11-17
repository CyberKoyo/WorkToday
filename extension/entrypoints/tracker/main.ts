import { addApplication, addApplications, getApplications, removeApplication, today, updateApplication } from '@/src/tracker/store';
import { readImport } from '@/src/tracker/importFile';

const FIELDS = ['title', 'company', 'date', 'salary', 'location'] as const;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const status = (msg: string) => { $('status').textContent = msg; };
const button = (label: string, aria: string, onclick: () => void) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  b.onclick = onclick;
  return b;
};

let editing: string | null = null; // id of the row loaded into the form

async function render() {
  const apps = (await getApplications()).sort((a, b) => b.date.localeCompare(a.date));
  $('empty').hidden = apps.length > 0;
  $('rows').replaceChildren(...apps.map((a) => {
    const tr = document.createElement('tr');
    for (const f of FIELDS) tr.insertCell().textContent = a[f];
    const name = `${a.title} at ${a.company}`;
    tr.insertCell().append(
      button('Edit', `Edit ${name}`, () => {
        for (const f of FIELDS) input(f).value = a[f];
        setEditing(a.id);
        input('title').focus();
      }),
      ' ',
      button('Delete', `Delete ${name}`, async () => {
        if (!confirm(`Delete ${name}?`)) return;
        await removeApplication(a.id);
        if (editing === a.id) reset();
        await render();
      }),
    );
    return tr;
  }));
}

function setEditing(id: string | null) {
  editing = id;
  $('submit').textContent = id ? 'Save changes' : 'Add';
  $('cancel').hidden = !id;
}

function reset(prefill?: URLSearchParams) {
  for (const f of FIELDS) input(f).value = prefill?.get(f) ?? '';
  input('date').value ||= today();
  setEditing(null);
}

$<HTMLFormElement>('add').onsubmit = async (e) => {
  e.preventDefault();
  const v = (f: (typeof FIELDS)[number]) => input(f).value.trim();
  const a = { title: v('title'), company: v('company'), date: v('date'), salary: v('salary'), location: v('location') };
  await (editing ? updateApplication({ ...a, id: editing }) : addApplication(a));
  status(editing ? 'Saved.' : 'Added.');
  reset();
  await render();
};
$('cancel').onclick = () => reset();

input('import').onchange = async () => {
  const file = input('import').files?.[0];
  if (!file) return;
  try {
    // Importing the same sheet twice adds nothing the second time.
    const key = (a: { title: string; company: string; date: string }) => `${a.title}|${a.company}|${a.date}`;
    const have = new Set((await getApplications()).map(key));
    const rows = await readImport(file);
    const fresh = rows.filter((a) => !have.has(key(a)));
    await addApplications(fresh);
    status(`Imported ${fresh.length} of ${rows.length} rows${fresh.length < rows.length ? ' (the rest were already here)' : ''}.`);
    await render();
  } catch (err) {
    status(`Could not import: ${err instanceof Error ? err.message : String(err)}`);
  }
  input('import').value = '';
};

// The banner's "Log application" link opens this page with ?title=… from the job page.
reset(new URLSearchParams(location.search));
void render();
