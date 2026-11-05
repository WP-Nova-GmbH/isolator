import { Field, FieldGrid, FieldSection } from '@/components/field';
import { OwnerSelect } from '@/components/owner-select';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { documentKindGroups, documentKindLabels, type DocumentDetail } from '@/lib/documents';
import { useAppData } from '@/lib/members';

interface DocumentFieldsProps {
  document?: DocumentDetail;
  /** A confirmed version stays as it was confirmed. */
  contentLocked?: boolean;
}

/** Every Document kind, grouped. */
export function DocumentKindOptions() {
  return documentKindGroups.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.kinds.map((kind) => (
        <option key={kind} value={kind}>
          {documentKindLabels[kind]}
        </option>
      ))}
    </optgroup>
  ));
}

/** The fields of a Document. Goes inside a form; documentPayload reads them back out. */
export function DocumentFields({ document, contentLocked = false }: DocumentFieldsProps) {
  const { me } = useAppData();

  return (
    <FieldSection label="Document content">
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" defaultValue={document?.title} required />
      </Field>
      <FieldGrid>
        <Field label="Kind" htmlFor="kind">
          <NativeSelect id="kind" name="kind" defaultValue={document?.kind ?? 'policy'}>
            <DocumentKindOptions />
          </NativeSelect>
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <OwnerSelect id="ownerId" name="ownerId" defaultValue={document?.ownerId ?? me.id} />
        </Field>
        <Field label="Source date, if known" htmlFor="datedOn">
          <Input
            id="datedOn"
            name="datedOn"
            type="date"
            className="read-only:bg-surface-sunken"
            defaultValue={document?.datedOn ?? ''}
            readOnly={contentLocked}
          />
        </Field>
      </FieldGrid>
      <p className="-mt-2 text-xs text-muted-foreground">
        The date on the document itself. When it was added here is kept separately.
      </p>
      <Field label="Content" htmlFor="content">
        <Textarea
          id="content"
          name="content"
          className="min-h-90 read-only:bg-surface-sunken"
          defaultValue={document?.content}
          readOnly={contentLocked}
        />
      </Field>
    </FieldSection>
  );
}
