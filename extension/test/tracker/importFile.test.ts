import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { csvRows, odsRows, toApplications, readImport } from '../../src/tracker/importFile';

const ODS = `<?xml version="1.0"?><office:document xmlns:office="urn:o" xmlns:table="urn:t" xmlns:text="urn:x"><office:body><office:spreadsheet>
<table:table table:name="Sheet1">
 <table:table-row><table:table-cell><text:p>Name of Positions</text:p></table:table-cell><table:table-cell><text:p>Company Name</text:p></table:table-cell><table:table-cell><text:p>Date Applied</text:p></table:table-cell><table:table-cell><text:p>Location</text:p></table:table-cell><table:table-cell><text:p>Status</text:p></table:table-cell></table:table-row>
 <table:table-row><table:table-cell><text:p>Risk &amp; Security Intern</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1"><text:p>Acme</text:p></table:table-cell><table:table-cell office:date-value="2026-08-18"><text:p>08/18/26</text:p></table:table-cell><table:table-cell><text:p>Boston, MA</text:p></table:table-cell><table:table-cell><text:p>Applied</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1019"/></table:table-row>
 <table:table-row><table:table-cell><text:p>Analyst</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell><text:p>Remote</text:p></table:table-cell></table:table-row>
 <table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
</table:table><table:table table:name="Sheet2"><table:table-row><table:table-cell><text:p>other</text:p></table:table-cell></table:table-row></table:table>
</office:spreadsheet></office:body></office:document>`;

describe('tracker import', () => {
  it('csv: quotes, embedded commas and newlines, CRLF', () => {
    expect(csvRows('a,"b, c","d ""e"""\r\n"x\ny",,z')).toEqual([['a', 'b, c', 'd "e"'], ['x\ny', '', 'z']]);
  });
  it('maps columns by header in any order and normalises dates', () => {
    const apps = toApplications(csvRows('Company,Salary,Job Title,Date\nAcme,"$90,000",Engineer,7/3/26\nGlobex,,Analyst,2026-01-02\n,,,\n'));
    expect(apps).toEqual([
      { title: 'Engineer', company: 'Acme', date: '2026-07-03', salary: '$90,000', location: '', status: '' },
      { title: 'Analyst', company: 'Globex', date: '2026-01-02', salary: '', location: '', status: '' },
    ]);
  });
  it('rejects a sheet with no title or company column', () => {
    expect(() => toApplications([['foo', 'bar'], ['1', '2']])).toThrow(/Title or Company/);
  });
  it('ods: first sheet, ISO date values, repeated empty cells keep columns aligned', () => {
    expect(toApplications(odsRows(ODS))).toEqual([
      { title: 'Risk & Security Intern', company: 'Acme', date: '2026-08-18', salary: '', location: 'Boston, MA', status: 'Applied' },
      { title: 'Analyst', company: '', date: '', salary: '', location: 'Remote', status: '' },
    ]);
  });
  it('readImport sniffs flat-XML ods vs csv', async () => {
    expect(await readImport(new File([ODS], 'Tracker.ods'))).toHaveLength(2);
    expect(await readImport(new File(['Title,Company\nA,B\n'], 't.csv'))).toHaveLength(1);
  });
  // The user's own sheet, when present next to the repo (untracked).
  it.skipIf(!existsSync('../Tracker.ods'))('reads the real Tracker.ods', async () => {
    const apps = await readImport(new File([readFileSync('../Tracker.ods')], 'Tracker.ods'));
    expect(apps.length).toBeGreaterThan(5);
    expect(apps[0]).toMatchObject({ company: 'Labelbox', date: '2026-07-13', location: 'SF, CA', status: 'Applied' });
  });
  it("reads the user's own sheet header (Name of Positions, Company Name, Date Applied, Location, Status)", () => {
    expect(toApplications([['Name of Positions', 'Company Name', 'Date Applied', 'Location', 'Status'], ['SOC Intern', 'Acme', '07/13/26', 'Boston, MA', 'Rejected']]))
      .toEqual([{ title: 'SOC Intern', company: 'Acme', date: '2026-07-13', salary: '', location: 'Boston, MA', status: 'Rejected' }]);
  });
});
