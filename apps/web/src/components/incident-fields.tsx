import { Field, FieldGrid } from '@/components/field';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { todayIso } from '@/lib/dates';
import type { IncidentDetail } from '@/lib/incidents';
import { useAppData } from '@/lib/members';
import type { Risk } from '@/lib/risks';

interface IncidentFieldsProps {
  incident?: IncidentDetail;
  risks: Risk[];
}

/** The fields of an Incident. Goes inside a form; incidentPayload reads them back out. */
export function IncidentFields({ incident, risks }: IncidentFieldsProps) {
  const { me, members } = useAppData();
  // A closed risk can stay linked, even though it is no longer offered.
  const linkedRisk = incident?.risk;
  const offered = risks.some((risk) => risk.ref === linkedRisk?.ref);

  return (
    <Card aria-label="Incident" className="flex flex-col gap-4">
      <Field label="What happened" htmlFor="title">
        <Input id="title" name="title" defaultValue={incident?.title} required />
      </Field>
      <Field label="Details" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={incident?.description} />
      </Field>
      <FieldGrid>
        <Field label="Occurred on" htmlFor="occurredOn">
          <Input
            id="occurredOn"
            name="occurredOn"
            type="date"
            max={todayIso()}
            defaultValue={incident?.occurredOn ?? todayIso()}
            required
          />
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <NativeSelect id="ownerId" name="ownerId" defaultValue={incident?.ownerId ?? me.id}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Linked risk" htmlFor="riskRef">
          <NativeSelect id="riskRef" name="riskRef" defaultValue={linkedRisk?.ref ?? ''}>
            <option value="">None</option>
            {linkedRisk && !offered && (
              <option value={linkedRisk.ref}>
                {linkedRisk.ref} {linkedRisk.title}
              </option>
            )}
            {risks.map((risk) => (
              <option key={risk.ref} value={risk.ref}>
                {risk.ref} {risk.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FieldGrid>
    </Card>
  );
}
