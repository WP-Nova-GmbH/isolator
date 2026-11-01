import { Field, FieldGrid } from '@/components/field';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { documentKindLabels, type DocumentDetail } from '@/lib/documents';
import { useAppData } from '@/lib/members';

interface DocumentFieldsProps {
  document?: DocumentDetail;
  /** A confirmed version stays as it was confirmed. */
  contentLocked?: boolean;
}

/** The fields of a Document. Goes inside a form; documentPayload reads them back out. */
export function DocumentFields({ document, contentLocked = false }: DocumentFieldsProps) {
  const { me, members } = useAppData();

  return (
    <Card aria-label="Document content" className="flex flex-col gap-4">
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" defaultValue={document?.title} required />
      </Field>
      <FieldGrid>
        <Field label="Kind" htmlFor="kind">
          <NativeSelect id="kind" name="kind" defaultValue={document?.kind ?? 'policy'}>
            {Object.entries(documentKindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <NativeSelect id="ownerId" name="ownerId" defaultValue={document?.ownerId ?? me.id}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FieldGrid>
      <Field label="Content" htmlFor="content">
        <Textarea
          id="content"
          name="content"
          className="min-h-90 read-only:bg-surface-sunken"
          defaultValue={document?.content}
          readOnly={contentLocked}
        />
      </Field>
    </Card>
  );
}
