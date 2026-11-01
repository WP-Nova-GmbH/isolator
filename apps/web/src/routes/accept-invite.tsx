import {
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { EntryPage } from '@/components/entry-page';
import { Field } from '@/components/field';
import { TextLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, refused } from '@/lib/api';
import { signIn } from '@/lib/auth';
import { RouteError } from './route-error';

interface Invite {
  organizationName: string;
  invitedBy: string;
  email: string;
  hasAccount: boolean;
}

export function acceptInviteLoader({ params }: LoaderFunctionArgs) {
  return api<Invite>(`/invites/${params.token}`, { signedOut: true });
}

export async function acceptInviteAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/invites/${params.token}`;
  const email = form.get('email');
  const password = form.get('password');
  return refused(async () => {
    if (form.get('hasAccount') === 'true') {
      await signIn(email, password);
      await api(`${path}/acceptance`, { method: 'POST', signedOut: true });
    } else {
      await api(`${path}/account`, {
        method: 'POST',
        body: { name: form.get('name'), password },
        signedOut: true,
      });
      await signIn(email, password);
    }
    return redirect('/');
  });
}

export function AcceptInvite() {
  const invite = useLoaderData<typeof acceptInviteLoader>();
  const result = useActionData<typeof acceptInviteAction>();
  const navigation = useNavigation();

  return (
    <EntryPage
      title={`Join ${invite.organizationName}`}
      description={`${invite.invitedBy} invited you. As a Member you can see and do everything in this ISMS.`}
      error={result && 'error' in result ? result.error : undefined}
    >
      <input type="hidden" name="hasAccount" value={String(invite.hasAccount)} />
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          value={invite.email}
          className="read-only:bg-surface-sunken"
          readOnly
        />
      </Field>
      {!invite.hasAccount && (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      )}
      <Field
        label={invite.hasAccount ? 'Your password' : 'Password, at least 12 characters'}
        htmlFor="password"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={invite.hasAccount ? 'current-password' : 'new-password'}
          minLength={invite.hasAccount ? undefined : 12}
          required
        />
      </Field>
      <Button type="submit" disabled={navigation.state !== 'idle'}>
        Join {invite.organizationName}
      </Button>
    </EntryPage>
  );
}

/** A link that was used, expired or revoked. */
export function InviteError() {
  const error = useRouteError();
  if (!(error instanceof ApiError) || error.status !== 404) return <RouteError fullPage />;

  return (
    <EntryPage
      title="This invitation no longer works"
      description="It was used, it expired, or it was replaced by a newer link. Ask whoever invited you for a new one."
      footer={<TextLink to="/sign-in">Sign in</TextLink>}
    >
      {null}
    </EntryPage>
  );
}
