import { readZip } from '../resume/docx';
import type { Application } from './store';

type Row = Omit<Application, 'id'>;

/** Cells of a CSV: quoted cells may hold commas, newlines and "" for a quote. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Cells of the first sheet of an OpenDocument spreadsheet (content.xml, or a flat-XML file). */
export function odsRows(xml: string): string[][] {
  const sheet = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('table:table')[0];
  if (!sheet) throw new Error('No sheet found in this file.');
  return [...sheet.getElementsByTagName('table:table-row')].map((tr) =>
    [...tr.children].filter((c) => c.localName === 'table-cell' || c.localName === 'covered-table-cell').flatMap((c) => {
      // A date cell shows "07/13/26" but carries the unambiguous ISO date.
      const value = c.getAttribute('office:date-value')
        ?? [...c.getElementsByTagName('text:p')].map((p) => p.textContent).join(' ');
      // Empty cells are run-length encoded, and a row's blank tail repeats thousands of times.
      const repeat = Math.min(Number(c.getAttribute('table:number-columns-repeated')) || 1, 50);
      return Array<string>(repeat).fill(value);
    }));
}

const COLUMNS: Array<[keyof Row, RegExp]> = [
  ['title', /title|position|role|job/i], ['company', /company|employer/i], ['date', /date|applied/i],
  ['salary', /salary|pay|compensation/i], ['location', /location|city/i],
];

// shortcut: slash dates are read as US month/day/year, switch on locale if a day-first sheet turns up.
function isoDate(s: string): string {
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) return `${us[3]!.length === 2 ? '20' : ''}${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Applications from sheet rows: the first row names the columns, in any order. */
export function toApplications(rows: string[][]): Row[] {
  const [header = [], ...body] = rows;
  const at: Partial<Record<keyof Row, number>> = {};
  header.forEach((h, i) => {
    const key = COLUMNS.find(([k, re]) => at[k] === undefined && re.test(h))?.[0];
    if (key) at[key] = i;
  });
  if (at.title === undefined && at.company === undefined) throw new Error('The first row needs a Title or Company column.');
  const cell = (r: string[], k: keyof Row) => (at[k] === undefined ? '' : r[at[k]] ?? '').trim();
  return body
    .map((r) => ({ title: cell(r, 'title'), company: cell(r, 'company'), date: isoDate(cell(r, 'date')), salary: cell(r, 'salary'), location: cell(r, 'location') }))
    .filter((a) => a.title || a.company);
}

export async function readImport(file: File): Promise<Row[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  const text = zipped
    ? (await readZip(bytes, (n) => n === 'content.xml')).get('content.xml') ?? ''
    : new TextDecoder().decode(bytes);
  return toApplications(text.trimStart().startsWith('<') ? odsRows(text) : csvRows(text));
}
