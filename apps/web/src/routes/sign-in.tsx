import { getToken } from '@clerk/react';
import { redirect } from 'react-router';
import { ClerkSignIn } from '@/components/clerk-sign-in';
import { EntryPage } from '@/components/entry-page';
import { api } from '@/lib/api';

export async function signInLoader() {
  const { claimed } = await api<{ claimed: boolean }>('/install', { signedOut: true });
  if (!claimed) return redirect('/claim');
  return (await getToken()) ? redirect('/') : null;
}

export function SignIn() {
  return (
    <EntryPage
      title="Sign in"
      footer="New here? An Organization is only open to its Members, so ask one of them for an invitation link."
    >
      <ClerkSignIn redirectTo="/" />
    </EntryPage>
  );
}
