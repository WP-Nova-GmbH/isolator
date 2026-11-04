import { Field, FieldGrid } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { todayIso } from '@/lib/dates';
import type { IsmsDocument } from '@/lib/documents';
import type { SoaEntry } from '@/lib/soa';
import { useFormFetcher } from '@/lib/use-form-fetcher';

interface EvidenceFormProps {
  /** SoA entries to choose from. Left out on an entry's own page. */
  entries?: SoaEntry[];
  documents: IsmsDocument[];
  onClose: () => void;
}

/** Posts intent=add-evidence to the page's action. */
export function EvidenceForm({ entries, documents, onClose }: EvidenceFormProps) {
  const fetcher = useFormFetcher(onClose);

  return (
    <Card aria-label="Add Evidence">
      <fetcher.Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
        <FormError message={fetcher.data?.error} />
        <FieldGrid>
          {entries && (
            <Field label="Control" htmlFor="evidence-ref">
              <NativeSelect id="evidence-ref" name="ref" required>
                {entries.map((entry) => (
                  <option key={entry.ref} value={entry.ref}>
                    {entry.ref} {entry.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Name, if not the file's or Document's own" htmlFor="evidence-title">
            <Input id="evidence-title" name="title" />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Upload, up to 25 MB" htmlFor="evidence-upload">
            <Input id="evidence-upload" name="upload" type="file" className="py-1.5" />
          </Field>
          <Field label="Or link a Document" htmlFor="evidence-document">
            <NativeSelect id="evidence-document" name="documentId" defaultValue="">
              <option value="">None</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Or where it is kept" htmlFor="evidence-location">
            <Input id="evidence-location" name="location" />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Dated, if known" htmlFor="evidence-dated">
            <Input id="evidence-dated" name="datedOn" type="date" max={todayIso()} />
          </Field>
          <Field label="Expires, if it does" htmlFor="evidence-expires">
            <Input id="evidence-expires" name="expiresOn" type="date" />
          </Field>
        </FieldGrid>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="add-evidence"
            disabled={fetcher.state !== 'idle'}
          >
            Add Evidence
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}
