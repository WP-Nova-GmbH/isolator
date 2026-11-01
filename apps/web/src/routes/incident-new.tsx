import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { FormError } from '@/components/form-error';
import { IncidentFields } from '@/components/incident-fields';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { incidentPayload } from '@/lib/incidents';
import type { Risk } from '@/lib/risks';

export function incidentNewLoader() {
  return api<Risk[]>('/risks');
}

export async function incidentNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { ref } = await api<{ ref: string }>('/incidents', {
      method: 'POST',
      body: incidentPayload(form),
    });
    return redirect(`/incidents/${ref}`);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: error.message };
    throw error;
  }
}

export function IncidentNew() {
  const risks = useLoaderData<typeof incidentNewLoader>();
  const result = useActionData<typeof incidentNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Report incident"
        description="Something that has happened and needs handling."
        back={{ to: '/incidents', label: 'Incidents' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <IncidentFields risks={risks} />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Report incident
          </Button>
        </div>
      </Form>
    </>
  );
}
