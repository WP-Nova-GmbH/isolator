import { Field, FieldGrid } from '@/components/field';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { aYearFromNow } from '@/lib/dates';
import { useAppData } from '@/lib/members';
import { criticalityLabels, type SupplierDetail } from '@/lib/suppliers';

/** The fields of a Supplier. Goes inside a form; supplierPayload reads them back out. */
export function SupplierFields({ supplier }: { supplier?: SupplierDetail }) {
  const { me, members } = useAppData();

  return (
    <>
      <Card aria-label="Supplier" className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" defaultValue={supplier?.name} required />
        </Field>
        <Field label="What they provide" htmlFor="provides">
          <Input id="provides" name="provides" defaultValue={supplier?.provides} />
        </Field>
        <FieldGrid>
          <Field label="Owner" htmlFor="ownerId">
            <NativeSelect id="ownerId" name="ownerId" defaultValue={supplier?.ownerId ?? me.id}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Criticality" htmlFor="criticality">
            <NativeSelect
              id="criticality"
              name="criticality"
              defaultValue={supplier?.criticality ?? 'medium'}
            >
              {Object.entries(criticalityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Handles personal data" htmlFor="handlesPersonalData">
            <NativeSelect
              id="handlesPersonalData"
              name="handlesPersonalData"
              defaultValue={supplier?.handlesPersonalData ? 'yes' : 'no'}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </NativeSelect>
          </Field>
        </FieldGrid>
      </Card>

      <Card aria-label="Contract and contact" className="flex flex-col gap-4">
        <h2>Contract and contact</h2>
        <FieldGrid>
          <Field label="Contract ends" htmlFor="contractEnds">
            <Input
              id="contractEnds"
              name="contractEnds"
              type="date"
              defaultValue={supplier?.contractEnds ?? ''}
            />
          </Field>
          <Field label="Next review" htmlFor="nextReviewOn">
            <Input
              id="nextReviewOn"
              name="nextReviewOn"
              type="date"
              defaultValue={supplier?.nextReviewOn ?? aYearFromNow()}
              required
            />
          </Field>
        </FieldGrid>
        <p className="text-xs text-muted-foreground">
          Leave the contract end empty if the contract rolls on.
        </p>
        <Field label="Who to contact about a security problem" htmlFor="contact">
          <Input id="contact" name="contact" defaultValue={supplier?.contact} />
        </Field>
        <Field label="Exit plan: what you do if they go away" htmlFor="exitPlan">
          <Textarea id="exitPlan" name="exitPlan" defaultValue={supplier?.exitPlan} />
        </Field>
      </Card>
    </>
  );
}
