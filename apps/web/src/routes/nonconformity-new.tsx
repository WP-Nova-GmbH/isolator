import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { FormError } from '@/components/form-error';
import { NonconformityFields } from '@/components/nonconformity-fields';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api, refused } from '@/lib/api';
import { nonconformityPayload } from '@/lib/nonconformities';

export async function nonconformityNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    const { ref } = await api<{ ref: string }>('/nonconformities', {
      method: 'POST',
      body: nonconformityPayload(form),
    });
    return redirect(`/nonconformities/${ref}`);
  });
}

export function NonconformityNew() {
  const result = useActionData<typeof nonconformityNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Add Nonconformity"
        description="Something the ISMS should do and doesn’t. You can add its cause once you know it."
        back={{ to: '/nonconformities', label: 'Nonconformities' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <NonconformityFields />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Add Nonconformity
          </Button>
        </div>
      </Form>
    </>
  );
}
