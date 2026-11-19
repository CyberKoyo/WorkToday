import { norm } from './matchOption';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today as YYYY-MM-DD, in local time, as the applicant's calendar shows it. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** A YYYY-MM profile date as the part a split date field asks for ("Start date year" → 2019). */
export function adaptForLabel(label: string, value: string): string {
  const m = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return value;
  const l = norm(label);
  if (/\bday\b/.test(l) && !/\bmonth\b/.test(l)) return String(Number(m[3] ?? '1'));
  if (/\bmonth\b/.test(l) && /\byear\b/.test(l)) return value; // MM/YYYY box: the placeholder decides
  if (/\byear\b/.test(l)) return m[1]!;
  if (/\bmonth\b/.test(l) && m[2]) return MONTH_NAMES[Number(m[2]) - 1] ?? value;
  return value;
}

/** A YYYY-MM profile date in the format a text box's placeholder shows. */
export function formatForPlaceholder(placeholder: string, value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return value;
  const [, y, mo] = m;
  const d = m[3] ?? '01';
  switch (placeholder.trim().toUpperCase()) {
    case 'MM/YYYY': return `${mo}/${y}`;
    case 'MM/DD/YYYY': return `${mo}/${d}/${y}`;
    case 'DD/MM/YYYY': return `${d}/${mo}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${mo}-${d}`;
    default: return value;
  }
}
