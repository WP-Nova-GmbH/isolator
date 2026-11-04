import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { AssetFields } from '@/components/asset-fields';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api, refused } from '@/lib/api';
import { assetPayload } from '@/lib/assets';

export async function assetNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    // On its page, so its Suppliers can be linked next.
    const { id } = await api<{ id: string }>('/assets', { method: 'POST', body: assetPayload(form) });
    return redirect(`/assets/${id}`);
  });
}

export function AssetNew() {
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
        <AssetFields />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Add asset
          </Button>
        </div>
      </Form>
    </>
  );
}
