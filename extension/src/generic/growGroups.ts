import { waitFor } from '../fill/dom';

const MAX_GROUPS = 10;

export async function growGroups(count: () => number, addButton: () => HTMLElement | null, wanted: number, timeoutMs = 3000) {
  const target = Math.min(wanted, MAX_GROUPS);
  while (count() < target) {
    const add = addButton();
    if (!add) return;
    const before = count();
    add.click();
    if (!(await waitFor(() => (count() > before ? true : null), timeoutMs))) return; // Add did nothing → stop
  }
}
