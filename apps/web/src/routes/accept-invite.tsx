import { Show, SignOutButton } from '@clerk/react';
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { ClerkSignIn } from '@/components/clerk-sign-in';
import { EntryPage } from '@/components/entry-page';
import { TextLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { api, ApiError, refused } from '@/lib/api';
import { RouteError } from './route-error';

interface Invite {
  organizationName: string;
  invitedBy: string;
  email: string;
}

export function acceptInviteLoader({ params }: LoaderFunctionArgs) {
  return api<Invite>(`/invites/${params.token}`, { signedOut: true });
}

export async function acceptInviteAction({ params }: ActionFunctionArgs) {
  return refused(async () => {
    await api(`/invites/${params.token}/acceptance`, { method: 'POST' });
    return redirect('/');
  });
}

export function AcceptInvite() {
  const invite = useLoaderData<typeof acceptInviteLoader>();
  const result = useActionData<typeof acceptInviteAction>();
  const navigation = useNavigation();
  const { pathname } = useLocation();

  return (
    <EntryPage
      title={`Join ${invite.organizationName}`}
      description={`${invite.invitedBy} invited ${invite.email}. As a Member you can see and do everything in this ISMS.`}
      error={result && 'error' in result ? result.error : undefined}
    >
      <Show when="signed-out">
        <ClerkSignIn redirectTo={pathname} email={invite.email} />
      </Show>
      <Show when="signed-in">
        <Form method="post" className="flex flex-col gap-2">
          <Button type="submit" disabled={navigation.state !== 'idle'}>
            Join {invite.organizationName}
          </Button>
          <SignOutButton redirectUrl={pathname}>
            <Button type="button" variant="ghost">
              Use another account
            </Button>
          </SignOutButton>
        </Form>
      </Show>
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
