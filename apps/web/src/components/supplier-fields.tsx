import { useState } from 'react';
import { Field, FieldGrid } from '@/components/field';
import { OwnerSelect, UNKNOWN, yesNoValue } from '@/components/owner-select';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { aYearFromNow } from '@/lib/dates';
import { useAppData } from '@/lib/members';
import {
  contractTermLabels,
  criticalityLabels,
  type ContractTerm,
  type SupplierDetail,
} from '@/lib/suppliers';

/** The fields of a Supplier. Goes inside a form; supplierPayload reads them back out. */
export function SupplierFields({ supplier }: { supplier?: SupplierDetail }) {
  const { me } = useAppData();
  const [term, setTerm] = useState<ContractTerm | ''>(supplier?.contractTerm ?? '');

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
            <OwnerSelect
              id="ownerId"
              name="ownerId"
              defaultValue={supplier ? supplier.ownerId : me.id}
              unassigned
            />
          </Field>
          <Field label="Criticality" htmlFor="criticality">
            <NativeSelect
              id="criticality"
              name="criticality"
              defaultValue={supplier?.criticality ?? ''}
            >
              <option value="">{UNKNOWN}</option>
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
              defaultValue={yesNoValue(supplier?.handlesPersonalData ?? null)}
            >
              <option value="">{UNKNOWN}</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </NativeSelect>
          </Field>
        </FieldGrid>
      </Card>

      <Card aria-label="Contract and contact" className="flex flex-col gap-4">
        <h2>Contract and contact</h2>
        <FieldGrid>
          <Field label="Contract term" htmlFor="contractTerm">
            <NativeSelect
              id="contractTerm"
              name="contractTerm"
              value={term}
              onChange={(event) => setTerm(event.target.value as ContractTerm | '')}
            >
              <option value="">{UNKNOWN}</option>
              {Object.entries(contractTermLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {term === 'fixed' && (
            <Field label="Contract ends" htmlFor="contractEnds">
              <Input
                id="contractEnds"
                name="contractEnds"
                type="date"
                defaultValue={supplier?.contractEnds ?? ''}
                required
              />
            </Field>
          )}
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
