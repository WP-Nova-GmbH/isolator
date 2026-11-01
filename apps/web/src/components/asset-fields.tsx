import { Field, FieldGrid } from '@/components/field';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  assetTypeLabels,
  classificationLabels,
  type AssetDetail,
} from '@/lib/assets';
import { useAppData } from '@/lib/members';
import type { Supplier } from '@/lib/suppliers';

interface AssetFieldsProps {
  asset?: AssetDetail;
  suppliers: Supplier[];
}

/** The fields of an asset. Goes inside a form; assetPayload reads them back out. */
export function AssetFields({ asset, suppliers }: AssetFieldsProps) {
  const { me, members } = useAppData();

  return (
    <Card aria-label="Asset" className="flex flex-col gap-4">
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={asset?.name} required />
      </Field>
      <FieldGrid>
        <Field label="Type" htmlFor="type">
          <NativeSelect id="type" name="type" defaultValue={asset?.type ?? 'information'}>
            {Object.entries(assetTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Classification" htmlFor="classification">
          <NativeSelect
            id="classification"
            name="classification"
            defaultValue={asset?.classification ?? 'internal'}
          >
            {Object.entries(classificationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <NativeSelect id="ownerId" name="ownerId" defaultValue={asset?.ownerId ?? me.id}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
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
    </Card>
  );
}
