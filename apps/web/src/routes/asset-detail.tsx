import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { AssetFields } from '@/components/asset-fields';
import { DetailLayout } from '@/components/detail-layout';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { LifecycleCard, type LifecycleAction } from '@/components/lifecycle-card';
import { PageHeader } from '@/components/page-header';
import { Ref } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, attempt } from '@/lib/api';
import { assetPayload, type AssetDetail as Asset } from '@/lib/assets';
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
  const navigation = useNavigation();
  const retired = asset.retiredAt !== null;
  const { canEdit } = usePermissions();
  const locked = retired || !canEdit;

  return (
    <>
      <PageHeader title={asset.name} back={{ to: '/assets', label: 'Assets' }} />
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
            <LifecycleCard key={String(retired)} {...lifecycleProps(asset)} />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(asset.history)} />
            </Card>
          </>
        }
      >
        <Form method="post" className="flex flex-col gap-6">
          <fieldset disabled={locked} className="contents">
            <AssetFields key={asset.id} asset={asset} suppliers={suppliers} />
          </fieldset>
          {!locked && (
            <div>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="outline"
                disabled={navigation.state !== 'idle'}
              >
                Save changes
              </Button>
            </div>
          )}
        </Form>

        <Card aria-label="Open risks" className="flex flex-col gap-3">
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
        </Card>
      </DetailLayout>
    </>
  );
}
