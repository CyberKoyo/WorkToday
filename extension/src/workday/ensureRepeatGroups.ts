import { SEL } from './selectors';
import { waitFor } from '../fill/fillField';
import type { Profile } from '../profile/profile';

const MAX_GROUPS = 10;

async function growSection(root: ParentNode, sectionSel: string, wanted: number, timeoutMs: number) {
  const section = root.querySelector<HTMLElement>(sectionSel);
  if (!section) return;
  const count = () => section.querySelectorAll(SEL.group).length;
  const target = Math.min(wanted, MAX_GROUPS);
  while (count() < target) {
    const add = section.querySelector<HTMLButtonElement>(SEL.addButton);
    if (!add) return;
    const before = count();
    add.click();
    if (!(await waitFor(() => (count() > before ? true : null), timeoutMs))) return; // Add did nothing → stop
  }
}

export async function ensureRepeatGroups(root: ParentNode, profile: Profile, timeoutMs = 3000): Promise<void> {
  await growSection(root, SEL.workSection, profile.work.length, timeoutMs);
  await growSection(root, SEL.educationSection, profile.education.length, timeoutMs);
}
