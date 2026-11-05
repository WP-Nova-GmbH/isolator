import { BadRequestException } from '@nestjs/common';

const FORMULA_START = /^[=+\-@]/;

function count(text: string, char: string) {
  return text.split(char).length - 1;
}

/**
 * Text from an uploaded file. Spreadsheets save UTF-8, or Windows-1252 in older versions of
 * Excel, which German umlauts would otherwise turn into garbage.
 */
export function decodeText(file: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(file);
  }
}

/**
 * Reads CSV as spreadsheets save it: separated by commas, or by semicolons as German Excel does,
 * with quoted cells that may hold separators, quotes and line breaks.
 */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const separator = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new BadRequestException('A quote in the file is never closed.');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Writes CSV that Excel opens with umlauts intact. A cell that starts like a formula gets a leading
 * apostrophe, so opening the file never runs it; readCell takes it off again.
 */
export function toCsv(rows: string[][]) {
  const cell = (value: string) => {
    const safe = FORMULA_START.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** A cell's value as written, without the apostrophe toCsv adds in front of a formula. */
export function readCell(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("'") && FORMULA_START.test(trimmed.slice(1))
    ? trimmed.slice(1)
    : trimmed;
}
