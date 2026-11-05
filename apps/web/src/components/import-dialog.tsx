import { useRef, useState } from 'react';
import { useFetcher, type FetcherWithComponents } from 'react-router';
import { Field } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { DataCell, MainCell } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { todayIso } from '@/lib/dates';
import { downloadFrom } from '@/lib/files';
import type { ImportPreview, ImportResult, ImportRow } from '@/lib/imports';
import { useFormFetcher } from '@/lib/use-form-fetcher';

interface ImportProps {
  /** The register's records, as a title says them: "assets", "Suppliers". */
  records: string;
  /** The register's API path, such as /assets. */
  path: string;
  /** The column that names an existing record: "ID" or "Ref". */
  refColumn: string;
  /** Anything else to know before choosing the file. */
  note?: string;
}

/**
 * Opens the Import dialog. The page's action has to answer it, through importAction: it previews
 * the chosen file, and saves it only when every row can be imported.
 */
export function ImportButton(props: ImportProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Import
      </Button>
      {open && <ImportDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({
  records,
  path,
  refColumn,
  note,
  onClose,
}: ImportProps & { onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const preview = useFetcher<ImportResult>();
  const saving = useFormFetcher(onClose);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const result = preview.state === 'idle' ? preview.data?.preview : undefined;
  const toSave = result ? result.add + result.change : 0;
  const ready = result !== undefined && result.refused === 0 && toSave > 0;

  function submit(fetcher: FetcherWithComponents<unknown>, intent: string) {
    const data = new FormData(form.current!);
    data.set('intent', intent);
    void fetcher.submit(data, { method: 'post', encType: 'multipart/form-data' });
  }

  function download() {
    setDownloadError(null);
    downloadFrom(`${path}/export`, `isolator-${path.slice(1)}-${todayIso()}.csv`).catch(
      (failure: unknown) =>
        setDownloadError(failure instanceof ApiError ? failure.message : 'The download failed.'),
    );
  }

  return (
    <FormDialog
      title={`Import ${records}`}
      description={`Add or change many ${records} at once from a CSV file.`}
      size="lg"
      onClose={onClose}
    >
      <form
        ref={form}
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          submit(saving, 'import');
        }}
      >
        <FormDialogBody>
          <FormError message={downloadError ?? saving.data?.error ?? preview.data?.error} />
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              Download the register as a CSV file. It is also the template.{' '}
              <Button type="button" variant="link" className="h-auto p-0" onClick={download}>
                Download CSV
              </Button>
            </li>
            <li>
              Change it in a spreadsheet. A row with {refColumn === 'ID' ? 'an' : 'a'} {refColumn}{' '}
              changes that record, and a row without one adds a record. Columns you delete stay as
              they are, and an empty cell means unknown, unassigned or none.
            </li>
            <li>Choose the file. Nothing changes until you import it.</li>
          </ol>
          {note && <p className="text-muted-foreground">{note}</p>}
          <Field label="CSV file" htmlFor="import-file">
            <Input
              id="import-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="py-1.5"
              required
              onChange={() => submit(preview, 'preview')}
            />
          </Field>
          {preview.state !== 'idle' && <p className="text-muted-foreground">Reading the file…</p>}
          {result && <PreviewTable result={result} records={records} />}
        </FormDialogBody>
        <FormDialogFooter>
          <Button type="submit" disabled={!ready || saving.state !== 'idle'}>
            {ready ? `Import ${toSave} ${toSave === 1 ? 'row' : 'rows'}` : 'Import'}
          </Button>
        </FormDialogFooter>
      </form>
    </FormDialog>
  );
}

const outcome: Record<Exclude<ImportRow['action'], 'unchanged'>, string> = {
  add: 'Add',
  change: 'Change',
  refused: 'Refused',
};

function PreviewTable({ result, records }: { result: ImportPreview; records: string }) {
  const shown = result.rows.filter((row) => row.action !== 'unchanged');
  const summary = [
    result.add > 0 && `${result.add} to add`,
    result.change > 0 && `${result.change} to change`,
    result.unchanged > 0 && `${result.unchanged} unchanged`,
    result.refused > 0 && `${result.refused} refused`,
  ].filter(Boolean);

  return (
    <section aria-label="What the import does" className="flex flex-col gap-3">
      <p>
        {summary.join(' · ')}.{' '}
        {result.refused > 0
          ? 'Correct the refused rows in the file and choose it again. Nothing is imported until every row can be.'
          : shown.length === 0 && `The file matches the ${records} as they are.`}
      </p>
      {shown.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <TableRow key={row.row}>
                <DataCell>{row.row}</DataCell>
                <TableCell className="whitespace-normal">{row.record}</TableCell>
                <MainCell
                  className={row.action === 'refused' ? 'text-danger-foreground' : undefined}
                >
                  {outcome[row.action as keyof typeof outcome]}
                  {row.detail && `: ${row.detail}`}
                </MainCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
