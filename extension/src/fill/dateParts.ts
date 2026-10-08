import { norm } from './matchOption';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A YYYY-MM profile date as the part a split date field asks for ("Start date year" → 2019). */
export function adaptForLabel(label: string, value: string): string {
  const m = value.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!m) return value;
  const l = norm(label);
  if (/\byear\b/.test(l)) return m[1]!;
  if (/\bmonth\b/.test(l) && m[2]) return MONTH_NAMES[Number(m[2]) - 1] ?? value;
  return value;
}

/** A YYYY-MM profile date in the format a text box's placeholder shows. */
export function formatForPlaceholder(placeholder: string, value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return value;
  const [, y, mo] = m;
  switch (placeholder.trim().toUpperCase()) {
    case 'MM/YYYY': return `${mo}/${y}`;
    case 'MM/DD/YYYY': return `${mo}/01/${y}`;
    case 'DD/MM/YYYY': return `01/${mo}/${y}`;
    case 'YYYY-MM-DD': return `${value}-01`;
    default: return value;
  }
}
