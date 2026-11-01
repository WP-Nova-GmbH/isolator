import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { SupplierFields } from '@/components/supplier-fields';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { supplierPayload } from '@/lib/suppliers';

export async function supplierNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { ref } = await api<{ ref: string }>('/suppliers', {
      method: 'POST',
      body: supplierPayload(form),
    });
    return redirect(`/suppliers/${ref}`);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: error.message };
    throw error;
  }
}

export function SupplierNew() {
  const result = useActionData<typeof supplierNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Add Supplier"
        description="Add contracts, reviews and assets once it's saved."
        back={{ to: '/suppliers', label: 'Suppliers' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <SupplierFields />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Add Supplier
          </Button>
        </div>
      </Form>
    </>
  );
}
