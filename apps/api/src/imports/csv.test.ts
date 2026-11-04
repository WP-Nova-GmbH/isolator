import { describe, expect, it } from 'vitest';
import { decodeText, parseCsv, readCell, toCsv } from './csv';

describe('CSV', () => {
  it('reads quoted cells with separators, quotes and line breaks', () => {
    const text = 'Name,Notes\r\n"Mail, calendar","Says ""hi""\nover two lines"\r\nCRM,\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Notes'],
      ['Mail, calendar', 'Says "hi"\nover two lines'],
      ['CRM', ''],
    ]);
  });

  it('reads semicolons, as German Excel saves', () => {
    expect(parseCsv('Name;Owner\nCRM;"Keller, Anna"')).toEqual([
      ['Name', 'Owner'],
      ['CRM', 'Keller, Anna'],
    ]);
  });

  it('refuses a quote that is never closed', () => {
    expect(() => parseCsv('Name\n"CRM')).toThrow('never closed');
  });

  it('decodes UTF-8 with a byte order mark, and Windows-1252', () => {
    expect(decodeText(Buffer.from('﻿München', 'utf8'))).toBe('München');
    expect(decodeText(Buffer.from([0x4d, 0xfc, 0x6e, 0x63, 0x68, 0x65, 0x6e]))).toBe('München');
  });

  it('writes what it reads back, without running formulas in a spreadsheet', () => {
    const rows = [
      ['Name', 'Notes'],
      ['=HYPERLINK("x")', 'a "quoted", line\nbreak'],
    ];
    const csv = toCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(parseCsv(decodeText(Buffer.from(csv))).map((row) => row.map(readCell))).toEqual(rows);
  });

  it('keeps an apostrophe that isn’t guarding a formula', () => {
    expect(readCell("'s Hertogenbosch")).toBe("'s Hertogenbosch");
    expect(readCell("'-5")).toBe('-5');
  });
});
