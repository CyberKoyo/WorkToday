import { SEL } from './selectors';
import { growGroups } from '../generic/growGroups';
import type { Profile } from '../profile/profile';

async function growSection(root: ParentNode, sectionSel: string, wanted: number, timeoutMs: number) {
  const section = root.querySelector<HTMLElement>(sectionSel);
  if (!section) return;
  await growGroups(() => section.querySelectorAll(SEL.entry).length, () => section.querySelector<HTMLButtonElement>(SEL.addButton), wanted, timeoutMs);
}

export async function ensureRepeatGroups(root: ParentNode, profile: Profile, timeoutMs = 3000): Promise<void> {
  await growSection(root, SEL.workSection, profile.work.length, timeoutMs);
  await growSection(root, SEL.educationSection, profile.education.length, timeoutMs);
}
