import { describe, it, expect, vi } from 'vitest';
import { startWatcher } from '../../src/autofill/watcher';
import { workday } from '../../src/workday/adapter';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('startWatcher', () => {
  it('fires once per new step, not on unrelated mutations', async () => {
    document.body.innerHTML = '<h2 data-automation-id="pageHeader">My Information</h2>';
    const onStep = vi.fn();
    const stop = startWatcher(document, workday, onStep, 10);
    expect(onStep).not.toHaveBeenCalled();                    // no fields yet
    document.body.insertAdjacentHTML('beforeend', '<div data-automation-id="formField-a"><label>A</label><input></div>');
    await sleep(40);
    expect(onStep).toHaveBeenCalledTimes(1);
    document.body.insertAdjacentHTML('beforeend', '<div>noise</div>');
    await sleep(40);
    expect(onStep).toHaveBeenCalledTimes(1);
    document.querySelector('[data-automation-id="pageHeader"]')!.textContent = 'My Experience';
    await sleep(40);
    expect(onStep).toHaveBeenCalledTimes(2);
    stop();
  });
});
