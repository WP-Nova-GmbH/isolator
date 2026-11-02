import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { DocumentFields } from '@/components/document-fields';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api, refused } from '@/lib/api';
import { documentPayload } from '@/lib/documents';

export async function documentNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    const { id } = await api<{ id: string }>('/documents', {
      method: 'POST',
      body: documentPayload(form),
    });
    return redirect(`/documents/${id}`);
  });
}

export function DocumentNew() {
  const result = useActionData<typeof documentNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="New Document"
        description="Write it here, or save it and upload a file. It stays a draft until someone confirms it."
        back={{ to: '/documents', label: 'Documents' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <DocumentFields />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Create Document
          </Button>
        </div>
      </Form>
    </>
  );
}
