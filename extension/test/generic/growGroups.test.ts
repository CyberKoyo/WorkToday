import { describe, it, expect, vi } from 'vitest';
import { growGroups } from '../../src/generic/growGroups';

function section(start: number, works = true) {
  document.body.innerHTML = `<div id="s">${'<div class="g"></div>'.repeat(start)}<button>Add</button></div>`;
  const s = document.getElementById('s')!;
  const btn = s.querySelector('button')!;
  if (works) btn.addEventListener('click', () => setTimeout(() => btn.before(Object.assign(document.createElement('div'), { className: 'g' })), 5));
  return { count: () => s.querySelectorAll('.g').length, add: () => btn };
}

describe('growGroups', () => {
  it('clicks Add until there are enough groups', async () => {
    const s = section(1);
    await growGroups(s.count, s.add, 3, 200);
    expect(s.count()).toBe(3);
  });
  it('does nothing when there are already enough', async () => {
    const s = section(2);
    await growGroups(s.count, s.add, 1, 200);
    expect(s.count()).toBe(2);
  });
  it('stops when Add does nothing or is missing', async () => {
    const s = section(1, false);
    await growGroups(s.count, s.add, 3, 60);
    expect(s.count()).toBe(1);
    await growGroups(s.count, () => null, 3, 60);
    expect(s.count()).toBe(1);
  });
  it('caps at 10 groups', async () => {
    const s = section(0);
    await growGroups(s.count, s.add, 50, 200);
    expect(s.count()).toBe(10);
  });
  it('never clicks an Add button that would submit the form', async () => {
    document.body.innerHTML = '<form id="f"><div class="g"></div><button>Add</button></form>';
    const submit = vi.fn((e: Event) => e.preventDefault());
    const f = document.getElementById('f')!;
    f.addEventListener('submit', submit);
    await growGroups(() => f.querySelectorAll('.g').length, () => f.querySelector('button'), 3, 60);
    expect(submit).not.toHaveBeenCalled();
  });
});
