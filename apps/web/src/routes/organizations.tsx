import { UserButton } from '@clerk/react';
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { CopyLink } from '@/components/copy-link';
import { Field, FieldGrid } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Logo } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { DataCell, EmptyRow, MainCell } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, refused } from '@/lib/api';
import { invitationLink } from '@/lib/auth';

interface Organization {
  id: string;
  name: string;
  createdAt: string;
  members: number;
  isMember: boolean;
}

interface OrganizationsData {
  me: { name: string; isOperator: boolean };
  organizations: Organization[];
}

export function organizationsLoader() {
  return api<OrganizationsData>('/organizations');
}

export async function organizationsAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = form.get('email');

  return refused(async () => {
    switch (form.get('intent')) {
      case 'open':
        await api(`/organizations/${form.get('id')}/activation`, { method: 'POST' });
        return redirect('/');
      case 'create': {
        const { token } = await api<{ token: string }>('/organizations', {
          method: 'POST',
          body: { name: form.get('name'), email },
        });
        return { link: invitationLink(token) };
      }
      case 'invite': {
        const { token } = await api<{ token: string }>(
          `/organizations/${form.get('organizationId')}/invitations`,
          { method: 'POST', body: { email } },
        );
        return { link: invitationLink(token) };
      }
    }
  });
}

function OperatorCards({ organizations }: { organizations: Organization[] }) {
  const navigation = useNavigation();

  return (
    <>
      <Card aria-label="Create Organization" className="flex flex-col gap-4">
        <h2>Create Organization</h2>
        <Form method="post" className="flex flex-col gap-4">
          <FieldGrid>
            <Field label="Organization name" htmlFor="organization-name">
              <Input id="organization-name" name="name" required />
            </Field>
            <Field label="Email of its first Member" htmlFor="first-member">
              <Input id="first-member" name="email" type="email" required />
            </Field>
          </FieldGrid>
          <div>
            <Button
              type="submit"
              name="intent"
              value="create"
              disabled={navigation.state !== 'idle'}
            >
              Create and get invitation link
            </Button>
          </div>
        </Form>
      </Card>

      {organizations.length > 0 && (
        <Card aria-label="Invite to an Organization" className="flex flex-col gap-4">
          <div>
            <h2>Invite to an Organization</h2>
            <p className="text-muted-foreground">
              For a link that was lost or ran out. To work in an Organization yourself, invite your
              own email.
            </p>
          </div>
          <Form method="post" className="flex flex-col gap-4">
            <FieldGrid>
              <Field label="Organization" htmlFor="invite-organization">
                <NativeSelect id="invite-organization" name="organizationId">
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Email" htmlFor="invite-email">
                <Input id="invite-email" name="email" type="email" required />
              </Field>
            </FieldGrid>
            <div>
              <Button
                type="submit"
                name="intent"
                value="invite"
                variant="outline"
                disabled={navigation.state !== 'idle'}
              >
                Get invitation link
              </Button>
            </div>
          </Form>
        </Card>
      )}
    </>
  );
}

export function Organizations() {
  const { me, organizations } = useLoaderData<typeof organizationsLoader>();
  const result = useActionData<typeof organizationsAction>();

  return (
    <div className="min-h-svh bg-background px-2 pb-2">
      <header className="mx-auto flex max-w-260 items-center justify-between gap-3 px-1 py-3.5">
        <Logo className="h-5.5 w-auto" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {me.name}
            {me.isOperator && ', Operator'}
          </span>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto flex max-w-260 flex-col gap-6 rounded-lg border bg-surface px-4 py-5 shadow-sheet md:px-9 md:pt-7 md:pb-9">
        <PageHeader
          title="Organizations"
          description="Each Organization is one ISMS working towards one certificate."
        />
        <FormError message={result && 'error' in result ? result.error : undefined} />
        {result && 'link' in result && <CopyLink link={result.link} />}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((organization) => (
              <TableRow key={organization.id}>
                <MainCell className="font-medium">{organization.name}</MainCell>
                <DataCell>{organization.members}</DataCell>
                <DataCell>{organization.createdAt.slice(0, 10)}</DataCell>
                <TableCell className="py-0 text-right">
                  {organization.isMember ? (
                    <Form method="post">
                      <input type="hidden" name="id" value={organization.id} />
                      <Button type="submit" name="intent" value="open" variant="ghost" size="xs">
                        Open
                      </Button>
                    </Form>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not a Member</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {organizations.length === 0 && (
              <EmptyRow colSpan={4}>
                {me.isOperator
                  ? 'No Organizations yet. Create the first one below.'
                  : 'You aren’t in an Organization yet. Ask for an invitation link.'}
              </EmptyRow>
            )}
          </TableBody>
        </Table>

        {me.isOperator && <OperatorCards organizations={organizations} />}
      </main>
    </div>
  );
}
