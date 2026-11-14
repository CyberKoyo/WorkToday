import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drive, runLoop } from '../../src/autofill/loop';
import { advanceButton, applyTargets, loopStep, signIn, type Filled, type Step, type StepDeps } from '../../src/autofill/loopPage';
import type { BgMessage, LoopReply } from '../../src/messages';

// happy-dom lays nothing out; give every element a box except those marked hidden.
beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.hasAttribute('hidden') ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => { vi.restoreAllMocks(); });

const now = async () => {}; // no real waiting between polls

describe('applyTargets', () => {
  it('finds visible Apply buttons and links, never a form\'s own', () => {
    document.body.innerHTML = `
      <button id="a"><span>APPLY NOW</span></button>
      <a id="b" href="https://acme.com/jobs/1">Apply</a>
      <div id="c" role="button">Apply for this job</div>
      <a id="outer" href="https://acme.com/jobs/2"><button>Apply</button></a>
      <button id="e">Easy Apply</button>
      <button>Applied</button><button>Ask</button><button hidden>Apply</button>
      <form><button>Apply</button></form>`;
    expect(applyTargets(document).map((el) => el.id)).toEqual(['a', 'b', 'c', 'outer', 'e']);
  });
});

describe('advanceButton', () => {
  it('takes the last enabled Next or Submit, by whole label', () => {
    document.body.innerHTML = `<button>Apply with LinkedIn</button><button id="top">Apply</button><button>Back</button>
      <form><button>Submit a referral</button><button id="go">Submit Application</button><button disabled>Next</button></form>`;
    expect(advanceButton(document)!.id).toBe('go');
    expect(advanceButton(document.querySelector('form')!, /^next/i)).toBeUndefined();
  });
});

describe('signIn', () => {
  it('enters the login, password twice, and presses the button', () => {
    document.body.innerHTML = `<form><input type="email" name="email"><input type="password" id="p1"><input type="password" id="p2">
      <button type="button" id="go">Create Account</button></form>`;
    const go = vi.fn();
    document.getElementById('go')!.onclick = go;
    expect(signIn(document, 'ada@x.com', 'pw')).toBe(true);
    expect([...document.querySelectorAll('input')].map((i) => i.value)).toEqual(['ada@x.com', 'pw', 'pw']);
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('leaves an application that also asks for a password alone', () => {
    document.body.innerHTML = `<form><input name="first"><input name="last"><input name="email"><input name="phone"><input type="password"><button>Next</button></form>`;
    expect(signIn(document, 'ada@x.com', 'pw')).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('');
  });
});

describe('loopStep', () => {
  const FORM = '<form><input id="fn"><button type="button" id="go">Submit application</button></form>';
  const deps = (over: Partial<StepDeps> & { filled?: Filled; submit?: boolean } = {}): StepDeps => ({
    adapter: { isFormPage: (doc) => !!doc.querySelector('#fn'), stepKey: () => 'step-1', extract: (doc) => [{ container: doc.querySelector('#fn') }] as never },
    settings: { email: '', password: '', submit: over.submit ?? true },
    fill: async () => (over.filled === undefined ? 'clean' : over.filled),
    top: true, clickApply: false, inPage: false, asksIdentity: () => false, ...over,
  });
  const clicks = () => { const fn = vi.fn(); document.getElementById('go')!.onclick = fn; return fn; };

  it('fills, submits once, then waits on the same step', async () => {
    document.body.innerHTML = FORM;
    const go = clicks();
    expect(await loopStep(deps())).toBe('acted');
    expect(await loopStep(deps())).toBe('waiting'); // the site kept the form: not pressed again
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('never submits with a question left open, or with submitting off', async () => {
    document.body.innerHTML = FORM;
    const go = clicks();
    expect(await loopStep(deps({ filled: 'attention' }))).toBe('stuck');
    expect(await loopStep(deps({ submit: false }))).toBe('filled');
    expect(await loopStep(deps({ filled: null }))).toBe('stuck');
    expect(go).not.toHaveBeenCalled();
  });
  it('does not count a form Auto-fill has nothing for', async () => {
    document.body.innerHTML = FORM;
    const go = clicks();
    expect(await loopStep(deps({ filled: 'nothing' }))).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });
  it('inside a board, takes only a form that opens like an application', async () => {
    document.body.innerHTML = FORM; // the board's own search or chat box
    const fill = vi.fn().mockResolvedValue('clean');
    expect(await loopStep(deps({ inPage: true, fill }))).toBeNull();
    expect(fill).not.toHaveBeenCalled();
    expect(await loopStep(deps({ inPage: true, fill, asksIdentity: () => true }))).toBe('acted');
  });
  it('signs in once per page with the saved login', async () => {
    document.body.innerHTML = '<form><input type="email"><input type="password"><button type="button" id="go">Sign In</button></form>';
    const go = clicks();
    const d = deps({ settings: { email: 'ada@x.com', password: 'pw', submit: false } });
    expect(await loopStep(d)).toBe('progress');
    expect(await loopStep(d)).toBe('waiting');
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('presses a posting\'s Apply only when asked, and only outside forms', async () => {
    document.body.innerHTML = '<button id="go">Apply</button>';
    const go = clicks();
    expect(await loopStep(deps())).toBeNull();
    expect(go).not.toHaveBeenCalled();
    expect(await loopStep(deps({ clickApply: true }))).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe('drive', () => {
  const script = (...steps: Step[]) => { let i = 0; return async () => [steps[i++] ?? null]; };
  it('reads the outcome from what the steps did', async () => {
    expect(await drive(script(null, 'acted', 'acted'), now)).toBe('sent');       // stepped twice, then the form went away
    expect(await drive(script('acted', 'waiting', 'waiting', 'waiting', 'waiting'), now)).toBe('stuck'); // the site refused it
    expect(await drive(script('progress', 'filled'), now)).toBe('filled');
    expect(await drive(script(), now)).toBe('none');
    expect(await drive(async () => ['acted'], now)).toBe('stuck');               // going round in circles
  });
  it('asks for the posting\'s Apply button once, after two quiet polls', async () => {
    const asked: boolean[] = [];
    await drive(async (clickApply) => { asked.push(clickApply); return [null]; }, now, 5);
    expect(asked).toEqual([false, false, true, false, false]);
  });
});

describe('runLoop', () => {
  const tabReply = (m: BgMessage): LoopReply => ({ ok: true, known: [], outcome: m.type === 'loop-job' ? 'sent' : undefined });

  it('clicks buttons, hands links to the background, and stops when asked', async () => {
    document.body.innerHTML = `<button id="a">Apply</button><a id="b" href="https://acme.com/jobs/1">Apply</a><button id="c">Apply</button>`;
    const clicked: string[] = [];
    document.body.addEventListener('click', (e) => { clicked.push((e.target as Element).id); e.preventDefault(); });
    const sent: BgMessage[] = [];
    let stop = false;
    const ask = async (m: BgMessage) => { sent.push(m); if (sent.length === 3) stop = true; return tabReply(m); };
    const line = await runLoop(() => {}, () => stop, async () => null, ask, now);
    expect(clicked).toEqual(['a']);
    expect(sent.map((m) => (m.type === 'loop-job' ? m.url : m.type))).toEqual(['loop-start', undefined, 'https://acme.com/jobs/1']);
    expect(line).toBe('2 jobs: 2 sent, 0 filled, 0 need you, 0 with no form. Check each tab.');
  });

  it('scrolls for more jobs when the list runs out', async () => {
    document.body.innerHTML = `<div id="list"><button>Apply</button></div>`;
    let scrolls = 0;
    const wait = async (ms: number) => { // the board answers the first scroll with one more job
      if (ms === 2500 && scrolls++ === 0) document.getElementById('list')!.insertAdjacentHTML('beforeend', '<button>Apply</button>');
    };
    expect(await runLoop(() => {}, () => false, async () => null, async (m) => tabReply(m), wait)).toMatch(/^2 jobs: 2 sent/);
    expect(scrolls).toBe(2);
  });

  it('steps an application that opens inside the board, and gives up when nothing opens at all', async () => {
    document.body.innerHTML = '<button>Apply</button>'.repeat(5);
    const noTab = async (): Promise<LoopReply> => ({ ok: true, known: [] });
    expect(await runLoop(() => {}, () => false, async () => 'filled', noTab, now)).toMatch(/^5 jobs: 0 sent, 5 filled/);
    expect(await runLoop(() => {}, () => false, async () => null, noTab, now)).toMatch(/^Apply buttons stopped opening anything.*3 jobs: .* 3 with no form/);
  });

  it('ends on a refusal with its reason, before clicking anything', async () => {
    document.body.innerHTML = `<button>Apply</button><button>Apply</button>`;
    const ask = vi.fn().mockResolvedValue({ ok: false, message: 'Allow all sites first.' });
    expect(await runLoop(() => {}, () => false, async () => null, ask, now)).toBe('Allow all sites first.');
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
