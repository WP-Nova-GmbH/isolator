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
import { signIn, signOut } from '@/lib/auth';

export async function signInLoader() {
  const { claimed } = await api<{ claimed: boolean }>('/install', { signedOut: true });
  return claimed ? null : redirect('/claim');
}

export async function signInAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return refused(async () => {
    await signIn(form.get('email'), form.get('password'));
    return redirect('/');
  });
}

export async function signOutAction() {
  await signOut();
  return redirect('/sign-in');
}

export function SignIn() {
  const result = useActionData<typeof signInAction>();
  const navigation = useNavigation();

  return (
    <EntryPage
      title="Sign in"
      error={result && 'error' in result ? result.error : undefined}
      footer="New here? Isolator has no public sign-up. Ask a Member of your Organization for an invitation link."
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" disabled={navigation.state !== 'idle'}>
        Sign in
      </Button>
    </EntryPage>
  );
}
