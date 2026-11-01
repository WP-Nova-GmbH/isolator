import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { RiskFields } from '@/components/risk-fields';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { riskPayload } from '@/lib/risks';

export async function riskNewAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { ref } = await api<{ ref: string }>('/risks', {
      method: 'POST',
      body: riskPayload(form),
    });
    return redirect(`/risks/${ref}`);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: error.message };
    throw error;
  }
}

export function RiskNew() {
  const result = useActionData<typeof riskNewAction>();
  const navigation = useNavigation();

  return (
    <>
      <PageHeader
        title="Add risk"
        description="It stays a draft until its risk owner gives a Confirmation."
        back={{ to: '/risks', label: 'Risks' }}
      />
      <FormError message={result?.error} />
      <Form method="post" className="flex flex-col gap-6">
        <RiskFields />
        <div>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Add risk
          </Button>
        </div>
      </Form>
    </>
  );
}
