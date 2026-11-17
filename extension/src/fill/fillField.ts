import { SEL } from '../workday/selectors';
import { clean, type ExtractedField, type FillResult } from '../ats/field';
import { matchOption, norm } from './matchOption';
import { asText, rawSet, setNativeValue, typeChars, waitFor, pressKey, setFilesViaDataTransfer } from './dom';
import type { ProfileValue } from '../profile/profile';

export type { FillResult } from '../ats/field';
export { setNativeValue, typeChars, waitFor } from './dom';

// Why a value was not added. The content script's console is not Workday's (which swallows logs), so this shows in the Web Console.
const warnMissed = (value: string, reason: string, labels?: string[]) =>
  console.warn('[workday-filler] not added:', JSON.stringify(value), reason, labels ? JSON.stringify(labels) : '');

async function fillMultiselect(c: HTMLElement, values: string[], timeoutMs: number, missed: string[]): Promise<FillResult> {
  const input = c.querySelector<HTMLInputElement>('input');
  if (!input) return 'error';
  const chips = () => c.querySelectorAll(SEL.multiSelectChip).length;
  if (chips()) return 'skipped_nonempty';
  const doc = c.ownerDocument;
  // An earlier prompt's results list (e.g. Field of Study) can stay open; read only lists opened since this
  // prompt started, or the newest list when Workday reuses one.
  const stale = new Set(doc.querySelectorAll(SEL.promptList));
  const ownList = () => {
    const lists = [...doc.querySelectorAll<HTMLElement>(SEL.promptList)];
    return lists.filter((l) => !stale.has(l)).at(-1) ?? lists.at(-1);
  };
  const results = () => [...(ownList()?.querySelectorAll<HTMLElement>(SEL.promptResult) ?? [])];
  const labelOf = (o: HTMLElement) => o.querySelector<HTMLElement>(SEL.promptLabel)?.dataset.automationLabel ?? clean(o.textContent);
  // The list is virtualized and keeps rendering rows after opening, so a search is detected by a new
  // total (aria-setsize) or a new first row, never by the row count alone.
  const listKey = () => { const r = results(); return r.length ? `${r[0]!.getAttribute('aria-setsize')}|${labelOf(r[0]!)}` : ''; };

  const box = input;
  // One value: search it, then keep what Enter added or pick the unique match. Returns whether a chip was added.
  const searchAndPick = async (value: string, first: boolean): Promise<boolean> => {
    box.focus();
    if (first) { box.click(); await waitFor(() => (results().length ? true : null), Math.min(timeoutMs, 1500)); }
    const before = listKey();
    const chipsBefore = chips();
    const gained = () => (chips() > chipsBefore ? true : null);
    // Searching "SIEM (Wazuh)" lists no "SIEM" at all (live RTX); the qualifier stays for picking among results.
    rawSet(box, value.replace(/\s*\([^)]*\)/g, '').trim() || value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    pressKey(box, 'Enter', 13);
    // A slow earlier search can land while this one runs; only a list that mentions this value counts.
    const stems = [...new Set([...norm(value).split(' '), norm(value).replace(/ /g, '')])].filter((w) => w.length >= 3).map((w) => w.slice(0, 4));
    const forValue = () => !stems.length || results().some((r) => stems.some((s) => norm(labelOf(r)).replace(/ /g, '').includes(s)));
    // Workday adds an exact term on Enter by itself; otherwise it lists results to pick from. Searches can be slow.
    const outcome = await waitFor(() => (gained() ? 'entered' : results().length && listKey() !== before && forValue() ? 'listed' : null), timeoutMs * 2);
    if (outcome !== 'listed') {
      if (!outcome) warnMissed(value, 'no results for it');
      return outcome === 'entered';
    }
    const found = results();
    const i = matchOption(value, found.map(labelOf), { ties: 'shortest' });
    if (i === -1) { warnMissed(value, 'no single clear match among', found.slice(0, 10).map(labelOf)); return false; }
    const row = found[i]!;
    const leaf = row.querySelector<HTMLElement>(SEL.promptLeaf);
    // Already selected: clicking would uncheck it.
    if (leaf?.dataset.automationChecked === 'Checked') return !!(await waitFor(gained, Math.min(timeoutMs, 1000)));
    (leaf ?? row).click();
    const ok = !!(await waitFor(gained, timeoutMs));
    if (!ok) warnMissed(value, `clicked "${labelOf(row)}" but Workday did not add it`);
    return ok;
  };

  let added = 0;
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  for (const [n, value] of unique.entries()) {
    if (await searchAndPick(value, n === 0)) added++;
    else missed.push(value);
  }
  rawSet(box, '');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  pressKey(box, 'Escape', 27);
  return added ? 'filled' : 'no_match';
}

async function fillSelect(c: HTMLElement, value: string, timeoutMs: number): Promise<FillResult> {
  const btn = c.querySelector<HTMLButtonElement>(SEL.dropdownButton)!;
  const current = clean(btn.textContent);
  if (current && current !== SEL.dropdownPlaceholder) return 'skipped_nonempty';
  const doc = c.ownerDocument;
  // Other listboxes (e.g. multiselect chips) may already be on the page; only options this click opens count.
  const before = new Set(doc.querySelectorAll(SEL.listboxOption));
  btn.click();
  const opts = await waitFor(() => {
    const l = [...doc.querySelectorAll<HTMLElement>(SEL.listboxOption)].filter((o) => !before.has(o));
    return l.length ? l : null;
  }, timeoutMs);
  if (!opts) {
    console.warn('[workday-filler] dropdown did not open:', JSON.stringify(value));
    return 'error';
  }
  const i = matchOption(value, opts.map((o) => o.textContent ?? ''));
  if (i === -1) {
    console.warn('[workday-filler] no dropdown option for', JSON.stringify(value));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'no_match';
  }
  opts[i]!.click();
  return 'filled';
}

/** `missed` collects values a multiselect prompt could not take (reported to the user by name). */
export async function fillField(f: ExtractedField, value: ProfileValue, timeoutMs = 3000, missed: string[] = []): Promise<FillResult> {
  const c = f.container;
  try {
    switch (f.kind) {
      case 'text':
      case 'textarea': {
        if (c.querySelector(SEL.multiSelect)) {
          return await fillMultiselect(c, Array.isArray(value) ? value : [typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value], timeoutMs, missed);
        }
        const el = c.querySelector<HTMLInputElement | HTMLTextAreaElement>(f.kind === 'text' ? SEL.textInput : 'textarea')!;
        if (el.value.trim()) return 'skipped_nonempty';
        // Workday keeps a typed value only once focus really leaves the box: the step's last box otherwise fails
        // "is required" on Save and Continue, silently for a scripted click (live RTX).
        el.focus();
        setNativeValue(el, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : asText(value));
        el.blur();
        return 'filled';
      }
      case 'select':
        return await fillSelect(c, asText(value), timeoutMs);
      case 'radio': {
        const radios = [...c.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
        if (radios.some((r) => r.checked)) return 'skipped_nonempty';
        const i = matchOption(asText(value), f.options ?? []);
        if (i === -1) return 'no_match';
        radios[i]!.click();
        return 'filled';
      }
      case 'checkbox': {
        if (f.options && f.members) {
          const boxes = f.members as HTMLInputElement[];
          if (boxes.some((b) => b.checked)) return 'skipped_nonempty';
          const text = asText(value);
          let i = matchOption(text, f.options);
          // The profile says yes / no / decline; the form spells each out ("I do not want to answer").
          const lead = /^decline/i.test(text) ? /\b(not (want|wish)|decline|prefer not)\b/i : /^(yes|no)$/i.test(text) ? new RegExp(`^${text}\\b`, 'i') : null;
          if (i === -1 && lead) { const hits = f.options.flatMap((o, n) => (lead.test(o) ? [n] : [])); if (hits.length === 1) i = hits[0]!; }
          if (i === -1) return 'no_match';
          boxes[i]!.click();
          return 'filled';
        }
        const cb = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        if (cb.checked) return 'skipped_nonempty';
        if (value === true || /^(yes|true|y)$/i.test(asText(value))) cb.click();
        return 'filled';
      }
      case 'date': {
        const month = c.querySelector<HTMLInputElement>(SEL.dateMonth);
        const year = c.querySelector<HTMLInputElement>(SEL.dateYear);
        if (month?.value || year?.value) return 'skipped_nonempty';
        const m = asText(value).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
        if (!m || !year || (month && !m[2])) return 'no_match';
        const day = c.querySelector<HTMLInputElement>(SEL.dateDay);
        // A full date is a signing date, today's. Workday shows a typed day but does not keep it ("Date is required",
        // live SWIB); picking today in its own calendar does.
        if (day && m[3]) {
          c.querySelector<HTMLElement>(SEL.dateIcon)?.click();
          const todayCell = await waitFor(() => c.ownerDocument.querySelector<HTMLElement>(SEL.dateToday), timeoutMs);
          if (!todayCell) return 'no_match';
          todayCell.click();
          return 'filled';
        }
        if (month) typeChars(month, m[2]!);
        if (day) typeChars(day, '01'); // profile dates stop at the month
        typeChars(year, m[1]!);
        // Workday keeps the date only once focus really leaves it; without this Save reports "From is required" (live RTX).
        year.blur();
        return 'filled';
      }
      case 'file':
        return 'no_match'; // files go through fillFile
    }
  } catch (e) {
    console.warn('[workday-filler] fill failed', f.label, e);
    return 'error';
  }
}

export async function fillFile(
  f: ExtractedField, file: File, setFiles: (input: HTMLInputElement, file: File) => void = setFilesViaDataTransfer, timeoutMs = 30000,
): Promise<FillResult> {
  if (f.container.querySelector(SEL.fileUploaded)) return 'skipped_nonempty';
  const input = f.container.querySelector<HTMLInputElement>(SEL.fileInput);
  if (!input) return 'error';
  try {
    setFiles(input, file);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    console.warn('[workday-filler] file upload failed', e);
    return 'error';
  }
  // Save and Continue does nothing while the upload runs (live RTX), so the step is not done until Workday confirms it.
  return (await waitFor(() => f.container.querySelector(SEL.fileUploaded), timeoutMs)) ? 'filled' : 'error';
}
