import { Show } from '@clerk/react';
import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { ClerkSignIn } from '@/components/clerk-sign-in';
import { EntryPage } from '@/components/entry-page';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, refused } from '@/lib/api';

export async function claimLoader() {
  const { claimed } = await api<{ claimed: boolean }>('/install', { signedOut: true });
  return claimed ? redirect('/sign-in') : null;
}

export async function claimAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    await api('/install/claim', { method: 'POST', body: { token: form.get('token') } });
    return redirect('/organizations');
  });
}

export function Claim() {
  const result = useActionData<typeof claimAction>();
  const navigation = useNavigation();

  return (
    <EntryPage
      title="Claim this install"
      description="Nobody has claimed this install yet. Sign in, enter the setup token from its logs, and you become its Operator."
      error={result && 'error' in result ? result.error : undefined}
    >
      <Show when="signed-out">
        <ClerkSignIn redirectTo="/claim" />
      </Show>
      <Show when="signed-in">
        <Form method="post" className="flex flex-col gap-4">
          <Field label="Setup token" htmlFor="token">
            <Input id="token" name="token" className="font-mono" autoComplete="off" required />
          </Field>
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Claim install
          </Button>
        </Form>
      </Show>
    </EntryPage>
  );
}
