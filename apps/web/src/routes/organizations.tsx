import { useState } from 'react';
import { UserButton } from '@clerk/react';
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
} from 'react-router';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { InvitationDialog } from '@/components/invitation-dialog';
import { Logo } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { columnHelper, DataTable } from '@/components/data-table';
import { dataCell, mainCell } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
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

function OperatorActions({ organizations }: { organizations: Organization[] }) {
  const [open, setOpen] = useState<'create' | 'invite' | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      {organizations.length > 0 && (
        <Button type="button" variant="outline" onClick={() => setOpen('invite')}>
          Invite to an Organization
        </Button>
      )}
      <Button type="button" onClick={() => setOpen('create')}>
        Create Organization
      </Button>
      {open === 'create' && (
        <InvitationDialog
          title="Create Organization"
          intent="create"
          submitLabel="Create and get invitation link"
          onClose={close}
        >
          <Field label="Organization name" htmlFor="organization-name">
            <Input id="organization-name" name="name" required autoFocus />
          </Field>
          <Field label="Email of its first Member" htmlFor="first-member">
            <Input id="first-member" name="email" type="email" required />
          </Field>
        </InvitationDialog>
      )}
      {open === 'invite' && (
        <InvitationDialog
          title="Invite to an Organization"
          intent="invite"
          submitLabel="Get invitation link"
          onClose={close}
        >
          <p className="text-muted-foreground">
            For a link that was lost or ran out. To work in an Organization yourself, invite your
            own email.
          </p>
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
        </InvitationDialog>
      )}
    </>
  );
}

const column = columnHelper<Organization>();

const columns = column.columns([
  column.accessor('name', {
    header: 'Organization',
    meta: { className: `${mainCell} font-medium` },
  }),
  column.accessor('members', {
    header: 'Members',
    enableGlobalFilter: false,
    meta: { className: dataCell },
  }),
  column.accessor((organization) => organization.createdAt.slice(0, 10), {
    id: 'created',
    header: 'Created',
    meta: { className: dataCell },
  }),
  column.display({
    id: 'open',
    header: () => <span className="sr-only">Open</span>,
    meta: { className: 'py-0 text-right' },
    cell: ({ row: { original: organization } }) =>
      organization.isMember ? (
        <Form method="post">
          <input type="hidden" name="id" value={organization.id} />
          <Button type="submit" name="intent" value="open" variant="ghost" size="xs">
            Open
          </Button>
        </Form>
      ) : (
        <span className="text-xs text-muted-foreground">Not a Member</span>
      ),
  }),
]);

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
          actions={me.isOperator && <OperatorActions organizations={organizations} />}
        />
        <FormError message={result && 'error' in result ? result.error : undefined} />

        <DataTable
          columns={columns}
          data={organizations}
          getRowId={(organization) => organization.id}
          searchLabel="Search Organizations"
          emptyText={
            me.isOperator
              ? 'No Organizations yet. Create the first one.'
              : 'You aren’t in an Organization yet. Ask for an invitation link.'
          }
        />
      </main>
    </div>
  );
}
