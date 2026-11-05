import {
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { AssetFields } from '@/components/asset-fields';
import { DetailLayout } from '@/components/detail-layout';
import { Fact, Facts } from '@/components/facts';
import { EditDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { LifecycleMenu, type LifecycleAction } from '@/components/lifecycle-menu';
import { LinkedItem, LinkPicker } from '@/components/link-picker';
import { UNASSIGNED, UNKNOWN } from '@/components/owner-select';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { Ref } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { api, attempt } from '@/lib/api';
import {
  assetPayload,
  assetStatusLabels,
  assetTypeLabels,
  classificationLabels,
  validationLabels,
  type AssetDetail as Asset,
} from '@/lib/assets';
import { historyItems } from '@/lib/audit';
import { usePermissions } from '@/lib/members';
import type { Supplier } from '@/lib/suppliers';

export async function assetDetailLoader({ params }: LoaderFunctionArgs) {
  const [asset, suppliers] = await Promise.all([
    api<Asset>(`/assets/${params.id}`),
    api<Supplier[]>('/suppliers'),
  ]);
  return { asset, suppliers };
}

export async function assetDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/assets/${params.id}`;
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/assets');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: assetPayload(form) });
      // The link belongs to both; the Supplier's history records it.
      case 'link-supplier':
        return api(`/suppliers/${form.get('id')}/assets`, {
          method: 'POST',
          body: { id: params.id },
        });
      case 'unlink-supplier':
        return api(`/suppliers/${form.get('id')}/assets/${params.id}`, { method: 'DELETE' });
      case 'retire':
        return api(`${path}/retirement`, { method: 'POST', body: { reason } });
      case 'reinstate':
        return api(`${path}/reinstatement`, { method: 'POST', body: { reason } });
    }
  });
}

function lifecycleProps(asset: Asset) {
  if (asset.retiredAt) {
    return {
      title: 'Retired asset',
      text: 'Reinstate this asset if it is in use again.',
      actions: [
        {
          intent: 'reinstate',
          label: 'Reinstate asset',
          prompt: 'Why is this asset in use again?',
        },
      ],
    };
  }
  const actions: LifecycleAction[] = [
    { intent: 'retire', label: 'Retire asset', prompt: 'Why is this asset no longer in use?' },
  ];
  if (asset.deletable) {
    actions.push({
      intent: 'delete',
      label: 'Delete asset',
      prompt: 'Why was this entered by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'Retire or delete',
    text: asset.deletable
      ? 'Retire this asset when it is no longer in use. Delete it if it was entered by mistake.'
      : 'Retire this asset when it is no longer in use. A risk points at it, so it can’t be deleted.',
    actions,
  };
}

export function AssetDetail() {
  const { asset, suppliers } = useLoaderData<typeof assetDetailLoader>();
  const result = useActionData<typeof assetDetailAction>();
  const retired = asset.retiredAt !== null;
  const { canEdit } = usePermissions();
  const locked = retired || !canEdit;
  const linkedSuppliers = new Set(asset.suppliers.map((supplier) => supplier.ref));

  return (
    <>
      <PageHeader
        title={asset.name}
        back={{ to: '/assets', label: 'Assets' }}
        actions={
          <>
            {!locked && (
              <EditDialog title="Edit asset">
                <AssetFields asset={asset} />
              </EditDialog>
            )}
            <LifecycleMenu {...lifecycleProps(asset)} />
          </>
        }
      />
      <FormError message={result?.error} />
      {retired && (
        <Alert>
          <AlertTitle>Retired on {asset.retiredAt?.slice(0, 10)}</AlertTitle>
          <AlertDescription>{asset.retiredReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(asset.history)} />
            </Card>
          </>
        }
      >
        <section aria-label="Asset">
          <Facts>
            <Fact label="Type">{assetTypeLabels[asset.type]}</Fact>
            <Fact label="Status">{assetStatusLabels[asset.status]}</Fact>
            <Fact label="Classification" empty={UNKNOWN}>
              {asset.classification && classificationLabels[asset.classification]}
            </Fact>
            <Fact label="Business owner" empty={UNASSIGNED}>
              {asset.ownerName}
            </Fact>
            <Fact label="Technical owner" empty={UNASSIGNED}>
              {asset.technicalOwnerName}
            </Fact>
            <Fact label="Locations: offices, data centres, cloud regions" wide>
              {asset.location}
            </Fact>
          </Facts>
        </section>

        <section aria-label="Record" className="flex flex-col gap-4">
          <h2>Record</h2>
          <Facts>
            <Fact label="Validation">{validationLabels[asset.validation]}</Fact>
            <Fact label="Source: where this record comes from">{asset.source}</Fact>
            <Fact label="Notes" empty="None" wide>
              {asset.notes}
            </Fact>
          </Facts>
        </section>

        <section aria-label="Suppliers" className="flex flex-col gap-3">
          <SectionHeader title="Suppliers">
            {!retired && (
              <LinkPicker
                label="Link Supplier"
                intent="link-supplier"
                options={suppliers
                  .filter((supplier) => !linkedSuppliers.has(supplier.ref))
                  .map((supplier) => ({ id: supplier.ref, label: supplier.name }))}
              />
            )}
          </SectionHeader>
          {asset.suppliers.map((supplier) => (
            <LinkedItem
              key={supplier.ref}
              id={supplier.ref}
              intent="unlink-supplier"
              label={supplier.name}
              locked={retired}
            >
              <Ref>{supplier.ref}</Ref>
              <Link to={`/suppliers/${supplier.ref}`} className="min-w-0 hover:underline">
                {supplier.name}
              </Link>
            </LinkedItem>
          ))}
          {asset.suppliers.length === 0 && (
            <p className="text-muted-foreground">
              No Suppliers linked. Link every one it depends on, such as the provider and whoever
              runs it for you.
            </p>
          )}
        </section>

        <section aria-label="Open risks" className="flex flex-col gap-3">
          <h2>Open risks</h2>
          {asset.risks.map((risk) => (
            <div key={risk.ref} className="flex items-baseline gap-2">
              <Ref>{risk.ref}</Ref>
              <Link to={`/risks/${risk.ref}`} className="min-w-0 hover:underline">
                {risk.title}
              </Link>
            </div>
          ))}
          {asset.risks.length === 0 && (
            <p className="text-muted-foreground">No open risks touch this asset.</p>
          )}
        </section>
      </DetailLayout>
    </>
  );
}
