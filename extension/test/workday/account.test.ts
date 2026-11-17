// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { accountPage, fillAccount, CREATE_MESSAGE } from '../../src/workday/account';

// Live Fiserv Create Account step (2026-11-17), cut to its controls. "beecatcher" is Workday's bot trap.
const field = (id: string, type: string) => `<div data-automation-id="formField-${id}"><input type="${type}" data-automation-id="${id}"></div>`;
const button = (id: string, text: string) =>
  `<div><div role="button" aria-label="${text}" data-automation-id="click_filter"></div><button type="submit" data-automation-id="${id}" aria-hidden="true">${text}</button></div>`;
const CREATE = `${field('email', 'text')}${field('password', 'password')}${field('verifyPassword', 'password')}
  ${button('createAccountSubmitButton', 'Create Account')}<button type="submit" data-automation-id="signInLink">Sign In</button>
  <input type="text" data-automation-id="beecatcher">`;
const SIGNIN = `${field('email', 'text')}${field('password', 'password')}${button('signInSubmitButton', 'Sign In')}`;
const val = (id: string) => document.querySelector<HTMLInputElement>(`[data-automation-id="${id}"]`)?.value;
// The button itself, not the overlay beside it: a scripted click on the overlay does nothing live.
const onPress = (id: string, fn: () => void) => document.querySelector(`[data-automation-id="${id}"]`)!.addEventListener('click', fn);

describe('workday account step', () => {
  it('tells the two forms apart', () => {
    document.body.innerHTML = CREATE;
    expect(accountPage(document)).toBe('create');
    document.body.innerHTML = SIGNIN;
    expect(accountPage(document)).toBe('signin');
    document.body.innerHTML = field('legalName--firstName', 'text');
    expect(accountPage(document)).toBeNull();
  });
  it('fills Create Account, leaves the bot trap empty and the press to the applicant', async () => {
    document.body.innerHTML = CREATE;
    let presses = 0;
    onPress('createAccountSubmitButton', () => { presses++; });
    expect(await fillAccount(document, 'a@b.co', 'pw-1')).toBe(CREATE_MESSAGE);
    expect([val('email'), val('password'), val('verifyPassword'), val('beecatcher')]).toEqual(['a@b.co', 'pw-1', 'pw-1', '']);
    expect(presses).toBe(0); // a scripted press is ignored live, and waiting on it sent the applicant to Sign In
  });
  it('signs in on the Sign In form', async () => {
    document.body.innerHTML = SIGNIN;
    let attempts = 0;
    onPress('signInSubmitButton', () => { document.body.dataset.sent = `${val('email')}/${val('password')}`; document.body.innerHTML = ''; });
    expect(await fillAccount(document, 'a@b.co', 'pw-1', () => { attempts++; }, 500)).toBeNull();
    expect(document.body.dataset.sent).toBe('a@b.co/pw-1');
    expect(attempts).toBe(1);
  });
  it('tries a refused password once and hands the step back', async () => {
    document.body.innerHTML = SIGNIN;
    let presses = 0;
    onPress('signInSubmitButton', () => { presses++; document.body.insertAdjacentHTML('beforeend', '<div data-automation-id="errorMessage">Wrong password</div>'); });
    expect(await fillAccount(document, 'a@b.co', 'bad', undefined, 500)).toMatch(/did not accept/);
    expect(presses).toBe(1);
  });
});
