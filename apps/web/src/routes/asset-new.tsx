import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { AssetFields } from '@/components/asset-fields';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { assetPayload } from '@/lib/assets';
import type { Supplier } from '@/lib/suppliers';

export function assetNewLoader() {
  return api<Supplier[]>('/suppliers');
}

export async function assetNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    await api('/assets', { method: 'POST', body: assetPayload(form) });
    return redirect('/assets');
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: error.message };
    throw error;
  }
}

export function AssetNew() {
  const suppliers = useLoaderData<typeof assetNewLoader>();
  const result = useActionData<typeof assetNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Add asset"
        description="Something of value that needs protecting."
        back={{ to: '/assets', label: 'Assets' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <AssetFields suppliers={suppliers} />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Add asset
          </Button>
        </div>
      </Form>
    </>
  );
}
