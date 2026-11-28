import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pageJobTitle } from '../../src/tracker/title';

const page = (title: string, head = '', body = '') => {
  document.head.innerHTML = head; // first: it would drop the <title> that document.title adds
  document.title = title;
  document.body.innerHTML = body;
  return document;
};
const og = (p: string, v: string) => `<meta property="${p}" content="${v}">`;

describe('pageJobTitle', () => {
  it('Oracle (careers.inl.gov, live): drops the site name og:title repeats at the end of the tab title', () => {
    const job = 'Cyber-Informed Engineering - Engineering Use Case and Model Development Intern - Spring 2027';
    expect(pageJobTitle(page(`${job} - Search Jobs - INL Interns Careers`, og('og:title', 'Search Jobs - INL Interns Careers')))).toBe(job);
  });
  it('Oracle job page (live): og:title is the job when the tab title opens with it', () => {
    const job = 'Cyber-Informed Engineering - Engineering Use Case and Model Development Intern - Summer 2027';
    expect(pageJobTitle(page(`${job} - Search Jobs - INL Interns Careers`, og('og:title', job) + og('og:site_name', 'Search Jobs - INL Interns')))).toBe(job);
  });
  it('also og:site_name; keeps the tab title when the page names no site or the job itself', () => {
    expect(pageJobTitle(page('Engineer - Acme Careers', og('og:site_name', 'Acme Careers')))).toBe('Engineer');
    expect(pageJobTitle(page('Engineer - Acme'))).toBe('');
    expect(pageJobTitle(page('Engineer - Acme', og('og:title', 'Engineer')))).toBe('Engineer'); // og:title is the job
    expect(pageJobTitle(page('Acme Careers', og('og:title', 'Acme Careers')))).toBe(''); // the site's own page
  });
  it('UKG (live capture): the title element, since the tab says "Quick apply"', () => {
    page('Quick apply');
    document.body.innerHTML = readFileSync(`${__dirname}/../fixtures/real-ukg-apply.html`, 'utf8');
    expect(pageJobTitle(document)).toBe('Senior Mechanical Engineer');
  });
});
