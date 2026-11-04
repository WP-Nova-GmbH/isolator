import { Field, FieldGrid, FieldSection } from '@/components/field';
import { OwnerSelect } from '@/components/owner-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { todayIso } from '@/lib/dates';
import { useAppData } from '@/lib/members';
import type { NonconformityDetail } from '@/lib/nonconformities';

/** The fields of a Nonconformity. Goes inside a form; nonconformityPayload reads them back out. */
export function NonconformityFields({ nonconformity }: { nonconformity?: NonconformityDetail }) {
  const { me } = useAppData();

  return (
    <FieldSection label="Nonconformity">
      <Field label="What falls short" htmlFor="title">
        <Input id="title" name="title" defaultValue={nonconformity?.title} required />
      </Field>
      <Field label="Details" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={nonconformity?.description} />
      </Field>
      <FieldGrid>
        <Field label="Where it was found" htmlFor="foundIn">
          <Input id="foundIn" name="foundIn" defaultValue={nonconformity?.foundIn} required />
        </Field>
        <Field label="Found on" htmlFor="foundOn">
          <Input
            id="foundOn"
            name="foundOn"
            type="date"
            max={todayIso()}
            defaultValue={nonconformity?.foundOn ?? todayIso()}
            required
          />
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <OwnerSelect
            id="ownerId"
            name="ownerId"
            defaultValue={nonconformity?.ownerId ?? me.id}
          />
        </Field>
      </FieldGrid>
      <Field label="What caused it, needed before you can close it" htmlFor="cause">
        <Textarea id="cause" name="cause" defaultValue={nonconformity?.cause} />
      </Field>
    </FieldSection>
  );
}
