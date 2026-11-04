import { BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/db.module';
import { members, users } from '../db/schema';
import type { Upload } from '../files/files.service';
import { decodeText, parseCsv, readCell } from './csv';

/** A register as CSV is small; this keeps a wrong file from being read at all. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

export interface Column<K extends string> {
  key: K;
  header: string;
}

/** What importing one row of the file does. */
export interface ImportRow {
  /** The row's number in the spreadsheet, the header being row 1. */
  row: number;
  record: string;
  action: 'add' | 'change' | 'unchanged' | 'refused';
  /** The columns that change, or why the row is refused. */
  detail: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  add: number;
  change: number;
  unchanged: number;
  refused: number;
}

export function summarize(rows: ImportRow[]): ImportPreview {
  const total = (action: ImportRow['action']) => rows.filter((row) => row.action === action).length;
  return {
    rows,
    add: total('add'),
    change: total('change'),
    unchanged: total('unchanged'),
    refused: total('refused'),
  };
}

/** Why one row can't be imported. The rest of the file is still checked. */
export class RowRefused extends Error {}

export interface TableRow<K extends string> {
  row: number;
  /** Only the columns the file has. A column left out keeps each record's value as it is. */
  cells: Partial<Record<K, string>>;
}

/** The file's rows by column. Columns are matched by their header, in any order and case. */
export function readTable<K extends string>(
  file: Buffer,
  columns: readonly Column<K>[],
): TableRow<K>[] {
  const [header = [], ...lines] = parseCsv(decodeText(file));
  const keys = header.map((title) => {
    const name = readCell(title);
    if (!name) return null;
    const column = columns.find((known) => known.header.toLowerCase() === name.toLowerCase());
    if (!column) {
      throw new BadRequestException(
        `The file has a column “${name}” that isn’t in the register. Use the columns of the downloaded file.`,
      );
    }
    return column.key;
  });
  const named = keys.filter((key) => key !== null);
  if (new Set(named).size !== named.length) {
    throw new BadRequestException('A column appears twice in the file.');
  }
  const rows = lines
    .map((cells, index) => ({
      row: index + 2,
      cells: Object.fromEntries(
        keys.flatMap((key, i) => (key ? [[key, readCell(cells[i] ?? '')]] : [])),
      ) as Partial<Record<K, string>>,
    }))
    .filter(({ cells }) => Object.values(cells).some((cell) => cell !== ''));
  if (rows.length === 0) throw new BadRequestException('The file has no rows to import.');
  if (rows.length > MAX_ROWS) {
    throw new BadRequestException(`Import at most ${MAX_ROWS} rows at a time.`);
  }
  return rows;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();

/** Blank, or written out as unknown. */
export function isUnknown(cell: string) {
  return cell === '' || normalize(cell) === 'unknown';
}

export function sameText(a: string, b: string) {
  return normalize(a) === normalize(b);
}

/** "A, B or C" */
export function listOf(items: string[]) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** One of a column's values, as its label ("Strictly confidential") or as the API writes it. */
export function choice<V extends string>(cell: string, labels: Record<V, string>, column: string) {
  if (cell === '') throw new RowRefused(`${column}: choose ${listOf(Object.values(labels))}.`);
  const values = Object.keys(labels) as V[];
  const found = values.find((value) => sameText(value, cell) || sameText(labels[value], cell));
  if (!found) {
    throw new RowRefused(`${column}: use ${listOf(Object.values(labels))}, not “${cell}”.`);
  }
  return found;
}

/** As choice, for a value that may not be known yet. */
export function optionalChoice<V extends string>(
  cell: string,
  labels: Record<V, string>,
  column: string,
) {
  return isUnknown(cell) ? null : choice(cell, labels, column);
}

/** A date as 2027-03-31, or as 31.03.2027 the way German spreadsheets write it. */
export function dateCell(cell: string, column: string) {
  if (cell === '') return null;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(cell);
  const iso = german
    ? `${german[3]}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}`
    : cell;
  if (!z.iso.date().safeParse(iso).success) {
    throw new RowRefused(`${column}: write a date such as 2027-03-31, not “${cell}”.`);
  }
  return iso;
}

const yes = ['yes', 'y', 'true', '1', 'ja'];
const no = ['no', 'n', 'false', '0', 'nein'];

/** Yes or No, or blank while it isn't known. */
export function yesNo(cell: string, column: string) {
  if (isUnknown(cell)) return null;
  if (yes.includes(normalize(cell))) return true;
  if (no.includes(normalize(cell))) return false;
  throw new RowRefused(`${column}: write Yes or No, or leave it empty while it’s unknown.`);
}

export function yesNoLabel(value: boolean | null) {
  return value === null ? '' : value ? 'Yes' : 'No';
}

/**
 * Finds the Member an owner column names, by email or by name. Blank or "Unassigned" means
 * nobody owns it yet. A name two Members share has to be written as an email.
 */
export async function ownerFinder(db: Pick<Database, 'select'>, organizationId: string) {
  const people = await db
    .select({ id: members.id, name: users.name, email: users.email, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, organizationId), isNull(members.removedAt)));

  /** keep: the record's owner now, who stays when the column still names them. */
  return (cell: string, column: string, keep?: string | null): string | null => {
    if (cell === '' || sameText(cell, 'unassigned')) return null;
    const current = people.find((person) => person.id === keep);
    if (current && sameText(current.name, cell)) return current.id;
    const byEmail = people.filter((person) => person.email.toLowerCase() === cell.toLowerCase());
    const matches = byEmail.length > 0 ? byEmail : people.filter((p) => sameText(p.name, cell));
    if (matches.length === 0) {
      throw new RowRefused(
        `${column}: no Member is called “${cell}”. Use a Member’s name or email.`,
      );
    }
    if (matches.length > 1) {
      throw new RowRefused(`${column}: more than one Member is called “${cell}”. Use their email.`);
    }
    const [person] = matches;
    if (person.role === 'auditor') {
      throw new RowRefused(`${column}: ${person.name} is an Auditor, who can’t own anything.`);
    }
    return person.id;
  };
}

/** The columns whose value differs, by header. */
export function changedColumns<K extends string>(
  columns: readonly Column<K>[],
  before: Partial<Record<K, unknown>>,
  after: Partial<Record<K, unknown>>,
) {
  return columns
    .filter(({ key }) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(({ header }) => header);
}

/**
 * Runs services on one transaction, so a file is imported whole or not at all. A transaction
 * answers every call they make on their database, and theirs become savepoints within it.
 */
export function inTransaction<T>(db: Database, run: (tx: Database) => Promise<T>) {
  return db.transaction((tx) => run(tx as unknown as Database));
}

/** The first problem a schema finds, as a row's reason. */
export function parseRow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new RowRefused(result.error.issues[0].message);
  return result.data;
}

/** For a route that takes a CSV file in the multipart field "file". */
export const CsvUpload = () =>
  UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }));

export function csvFile(upload: Pick<Upload, 'buffer'> | undefined) {
  if (!upload) throw new BadRequestException('Choose a CSV file.');
  return upload.buffer;
}
