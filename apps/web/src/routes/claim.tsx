import {
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { EntryPage } from '@/components/entry-page';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, refused } from '@/lib/api';
import { signIn } from '@/lib/auth';

export async function claimLoader() {
  const { claimed } = await api<{ claimed: boolean }>('/install', { signedOut: true });
  return claimed ? redirect('/sign-in') : null;
}

export async function claimAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    await api('/install/claim', {
      method: 'POST',
      body: Object.fromEntries(form),
      signedOut: true,
    });
    await signIn(form.get('email'), form.get('password'));
    return redirect('/organizations');
  });
}

export function Claim() {
  const result = useActionData<typeof claimAction>();
  const navigation = useNavigation();

  return (
    <EntryPage
      title="Claim this install"
      description="Nobody has claimed this install yet. Enter the setup token from its logs and you become its Operator."
      error={result && 'error' in result ? result.error : undefined}
    >
      <Field label="Setup token" htmlFor="token">
        <Input id="token" name="token" className="font-mono" autoComplete="off" required />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password, at least 12 characters" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Button type="submit" disabled={navigation.state !== 'idle'}>
        Claim install
      </Button>
    </EntryPage>
  );
}
