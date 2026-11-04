import { Field, FieldGrid } from '@/components/field';
import { OwnerSelect, UNKNOWN } from '@/components/owner-select';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  assetStatusLabels,
  assetTypeLabels,
  classificationLabels,
  validationLabels,
  type AssetDetail,
} from '@/lib/assets';
import { useAppData } from '@/lib/members';
import type { Supplier } from '@/lib/suppliers';

interface AssetFieldsProps {
  asset?: AssetDetail;
  suppliers: Supplier[];
}

function Options({ labels }: { labels: Record<string, string> }) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

/** The fields of an asset. Goes inside a form; assetPayload reads them back out. */
export function AssetFields({ asset, suppliers }: AssetFieldsProps) {
  const { me } = useAppData();

  return (
    <>
      <Card aria-label="Asset" className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" defaultValue={asset?.name} required />
        </Field>
        <FieldGrid>
          <Field label="Type" htmlFor="type">
            <NativeSelect id="type" name="type" defaultValue={asset?.type ?? 'information'}>
              <Options labels={assetTypeLabels} />
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={asset?.status ?? 'operational'}>
              <Options labels={assetStatusLabels} />
            </NativeSelect>
          </Field>
          <Field label="Classification" htmlFor="classification">
            <NativeSelect
              id="classification"
              name="classification"
              defaultValue={asset ? (asset.classification ?? '') : ''}
            >
              <option value="">{UNKNOWN}</option>
              <Options labels={classificationLabels} />
            </NativeSelect>
          </Field>
          <Field label="Business owner" htmlFor="ownerId">
            <OwnerSelect
              id="ownerId"
              name="ownerId"
              defaultValue={asset ? asset.ownerId : me.id}
              unassigned
            />
          </Field>
          <Field label="Technical owner" htmlFor="technicalOwnerId">
            <OwnerSelect
              id="technicalOwnerId"
              name="technicalOwnerId"
              defaultValue={asset?.technicalOwnerId ?? null}
              unassigned
            />
          </Field>
          <Field label="Supplier that provides it" htmlFor="supplierRef">
            <NativeSelect
              id="supplierRef"
              name="supplierRef"
              defaultValue={asset?.supplier?.ref ?? ''}
            >
              <option value="">None</option>
              {suppliers.map((supplier) => (
                <option key={supplier.ref} value={supplier.ref}>
                  {supplier.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGrid>
        <Field label="Locations: offices, data centres, cloud regions" htmlFor="location">
          <Input id="location" name="location" defaultValue={asset?.location} />
        </Field>
      </Card>

      <Card aria-label="Record" className="flex flex-col gap-4">
        <h2>Record</h2>
        <FieldGrid>
          <Field label="Validation" htmlFor="validation">
            <NativeSelect
              id="validation"
              name="validation"
              defaultValue={asset?.validation ?? 'unvalidated'}
            >
              <Options labels={validationLabels} />
            </NativeSelect>
          </Field>
          <Field label="Source: where this record comes from" htmlFor="source">
            <Input
              id="source"
              name="source"
              defaultValue={asset?.source}
              placeholder="Inventory export, interview, contract"
            />
          </Field>
        </FieldGrid>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={asset?.notes} />
        </Field>
      </Card>
    </>
  );
}
