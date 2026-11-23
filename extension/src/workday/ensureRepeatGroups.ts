import { SEL } from './selectors';
import { growGroups } from '../generic/growGroups';
import { fillField } from '../fill/fillField';
import { matchOption } from '../fill/matchOption';
import { clean } from '../ats/field';
import { safeClick, waitFor } from '../fill/dom';
import type { CertEntry, Profile } from '../profile/profile';

const MAX_CERTS = 10;

async function growSection(root: ParentNode, sectionSel: string, wanted: number, timeoutMs: number) {
  const section = root.querySelector<HTMLElement>(sectionSel);
  if (!section) return;
  await growGroups(() => section.querySelectorAll(SEL.entry).length, () => section.querySelector<HTMLButtonElement>(SEL.addButton), wanted, timeoutMs);
}

/**
 * One row per certification Workday's catalog has; a certification it lacks has its row deleted (live 2026-11-18:
 * the prompt lists issuers, and searching the name lists that issuer's certifications). `profile.certifications`
 * becomes the kept rows in page order, so each row's number, dates and proof are that certification's.
 */
async function fitCertifications(root: ParentNode, profile: Profile, timeoutMs: number) {
  const section = root.querySelector<HTMLElement>(SEL.certificationSection);
  if (!section || !profile.certifications.length) return;
  const rows = () => {
    const all = [...section.querySelectorAll<HTMLElement>(SEL.entry)].filter((g) => g.querySelector(SEL.multiSelect));
    return all.filter((g) => !all.some((o) => o !== g && o.contains(g)));
  };
  const chipOf = (row: HTMLElement) => clean(row.querySelector(SEL.multiSelectChip)?.textContent);
  const remaining = profile.certifications.slice(0, MAX_CERTS);
  const kept = new Map<HTMLElement, CertEntry>();
  const unmatched = new Set<HTMLElement>(); // picked rows whose chip no profile name matched
  // Rows an earlier pass (or the applicant) already picked.
  for (const row of rows()) {
    const chip = chipOf(row);
    if (!chip) continue;
    const i = remaining.findIndex((c) => matchOption(c.name, [chip]) === 0);
    if (i < 0) unmatched.add(row);
    kept.set(row, i >= 0 ? remaining.splice(i, 1)[0]! : { name: chip, number: '', issuedDate: '', expirationDate: '' });
  }
  for (const cert of remaining) {
    let row = rows().find((r) => !kept.has(r) && !chipOf(r));
    if (!row) {
      const before = rows().length;
      const add = section.querySelector<HTMLElement>(SEL.addButton);
      if (!add || !safeClick(add) || !(await waitFor(() => (rows().length > before ? true : null), timeoutMs))) break;
      row = rows().find((r) => !kept.has(r) && !chipOf(r));
      if (!row) break;
    }
    const container = row.querySelector<HTMLElement>(SEL.multiSelect)!.closest<HTMLElement>(SEL.fieldContainer) ?? row;
    const result = await fillField({ id: '', label: 'Certification', kind: 'text', required: false, groupIndex: 0, container }, cert.name, timeoutMs);
    // The same pick as another row is a duplicate: a chip worded unlike the profile name, or two names one item fits.
    const twin = result === 'filled' ? rows().find((r) => r !== row && kept.has(r) && chipOf(r) === chipOf(row)) : undefined;
    if (result === 'filled' && !twin) { kept.set(row, cert); continue; }
    if (twin && unmatched.delete(twin)) kept.set(twin, cert); // that row is this cert; give it the number and dates
    const trash = (b: HTMLButtonElement) => !!b.querySelector(SEL.trashIcon);
    const del = [...row.querySelectorAll<HTMLButtonElement>('button')].find(trash)
      ?? [...(row.parentElement?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => trash(b) && !rows().some((r) => r !== row && r.contains(b)));
    const gone = row;
    if (!del || !safeClick(del) || !(await waitFor(() => (!gone.isConnected ? true : null), timeoutMs))) {
      console.warn('[workday-filler] certification', twin ? 'already picked' : 'not in the list', 'and its row could not be deleted:', JSON.stringify(cert.name));
      return; // left for the applicant; the profile order no longer matches the page's, so it is not changed
    }
    console.info('[workday-filler] certification', twin ? 'already picked' : 'not in the list', 'row deleted:', JSON.stringify(cert.name));
  }
  // Rows in page order; Workday numbers them 1..n, which is each field's groupIndex.
  profile.certifications = rows().filter((r) => kept.has(r)).map((r) => kept.get(r)!);
}

export async function ensureRepeatGroups(root: ParentNode, profile: Profile, timeoutMs = 3000): Promise<void> {
  await growSection(root, SEL.workSection, profile.work.length, timeoutMs);
  await growSection(root, SEL.educationSection, profile.education.length, timeoutMs);
  await fitCertifications(root, profile, timeoutMs);
}
