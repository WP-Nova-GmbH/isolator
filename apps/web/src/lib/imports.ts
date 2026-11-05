import { api, attempt, refused } from '@/lib/api';

/** What importing one row of a CSV file does. */
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

export type ImportResult = { preview?: ImportPreview; error?: string; saved?: boolean } | null;

/**
 * A register page's action for its Import dialog: "preview" says what the file would do, and
 * "import" saves it. path is the register's API path, such as /assets.
 */
export async function importAction(path: string, form: FormData): Promise<ImportResult> {
  const body = new FormData();
  const file = form.get('file');
  if (file) body.set('file', file);
  if (form.get('intent') === 'import') {
    return attempt(() => api(`${path}/import`, { method: 'POST', body }));
  }
  return refused(async () => ({
    preview: await api<ImportPreview>(`${path}/import/preview`, { method: 'POST', body }),
  }));
}
