import { useMemo, useState } from 'react';
import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
} from 'react-router';
import { Fact, Facts } from '@/components/facts';
import { Field } from '@/components/field';
import {
  EditDialog,
  FormDialog,
  FormDialogBody,
  FormDialogFooter,
} from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { InvitationDialog } from '@/components/invitation-dialog';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import { dataCell, mainCell } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, attempt, refused } from '@/lib/api';
import { invitationLink } from '@/lib/auth';
import {
  roleDescriptions,
  roleLabels,
  useAppData,
  usePermissions,
  type Invitation,
  type Member,
  type Role,
} from '@/lib/members';
import { useFormFetcher } from '@/lib/use-form-fetcher';

export function membersLoader() {
  return api<Invitation[]>('/invitations');
}

export async function membersAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const id = form.get('id');

  if (form.get('intent') === 'invite') {
    return refused(async () => {
      const { token } = await api<{ token: string }>('/invitations', {
        method: 'POST',
        body: { email: form.get('email'), role: form.get('role') },
      });
      return { link: invitationLink(token) };
    });
  }
  return attempt(async () => {
    switch (form.get('intent')) {
      case 'revoke':
        return api(`/invitations/${id}`, { method: 'DELETE' });
      case 'remove':
        return api(`/members/${id}/removal`, {
          method: 'POST',
          body: { reason: form.get('reason') },
        });
      case 'rename':
        return api('/organization', { method: 'PUT', body: { name: form.get('name') } });
      case 'change-role':
        return api(`/members/${id}/role`, { method: 'PUT', body: { role: form.get('role') } });
    }
  });
}

function RoleOptions() {
  return Object.entries(roleLabels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function ChangeRole({ member, onClose }: { member: Member; onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title={`Change the role of ${member.name}`} onClose={onClose}>
      <fetcher.Form method="post" preventScrollReset className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <input type="hidden" name="id" value={member.id} />
          <Field label="Role" htmlFor={`role-${member.id}`}>
            <NativeSelect id={`role-${member.id}`} name="role" defaultValue={member.role}>
              <RoleOptions />
            </NativeSelect>
          </Field>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value="change-role"
            disabled={fetcher.state !== 'idle'}
          >
            Change role
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

function RemoveMember({ member, onClose }: { member: Member; onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title={`Remove ${member.name}`} onClose={onClose}>
      <fetcher.Form method="post" preventScrollReset className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <input type="hidden" name="id" value={member.id} />
          <Field label="Why are they leaving?" htmlFor={`reason-${member.id}`}>
            <Textarea id={`reason-${member.id}`} name="reason" required autoFocus />
          </Field>
        </FormDialogBody>
        <FormDialogFooter cancelLabel="Keep">
          <Button
            type="submit"
            name="intent"
            value="remove"
            variant="destructive"
            disabled={fetcher.state !== 'idle'}
          >
            Remove
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

function MemberActions({ member }: { member: Member }) {
  const { me } = useAppData();
  const [open, setOpen] = useState<'role' | 'remove' | null>(null);
  const close = () => setOpen(null);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen('role')}>
        Change role
      </Button>
      {member.id !== me.id && (
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen('remove')}>
          Remove
        </Button>
      )}
      {open === 'role' && <ChangeRole member={member} onClose={close} />}
      {open === 'remove' && <RemoveMember member={member} onClose={close} />}
    </div>
  );
}

const member = columnHelper<Member>();

const memberColumns = member.columns([
  member.accessor('name', { header: 'Name', meta: { className: `${mainCell} font-medium` } }),
  member.accessor('email', { header: 'Email', meta: { className: dataCell } }),
  member.accessor((row) => roleLabels[row.role], {
    id: 'role',
    header: 'Role',
    sortFn: sortByOrder(Object.keys(roleLabels), (row) => row.role),
  }),
  member.accessor('risksOwned', {
    header: 'Risks owned',
    enableGlobalFilter: false,
    meta: { className: dataCell },
  }),
  member.accessor((row) => row.joinedAt.slice(0, 10), {
    id: 'joined',
    header: 'Joined',
    meta: { className: dataCell },
  }),
]);

const memberActions = member.display({
  id: 'actions',
  header: () => <span className="sr-only">Actions</span>,
  meta: { className: 'py-0 text-right' },
  cell: ({ row }) => <MemberActions member={row.original} />,
});

const invitation = columnHelper<Invitation>();

const invitationColumns = invitation.columns([
  invitation.accessor('email', { header: 'Email', meta: { className: mainCell } }),
  invitation.accessor((row) => roleLabels[row.role], {
    id: 'role',
    header: 'Role',
    sortFn: sortByOrder(Object.keys(roleLabels), (row) => row.role),
  }),
  invitation.accessor('invitedBy', { header: 'Invited by' }),
  invitation.accessor((row) => row.expiresAt.slice(0, 10), {
    id: 'expires',
    header: 'Expires',
    meta: { className: dataCell },
  }),
]);

const invitationActions = invitation.display({
  id: 'actions',
  header: () => <span className="sr-only">Actions</span>,
  meta: { className: 'py-0 text-right' },
  cell: ({ row }) => (
    <Form method="post">
      <input type="hidden" name="id" value={row.original.id} />
      <Button type="submit" name="intent" value="revoke" variant="ghost" size="xs">
        Revoke
      </Button>
    </Form>
  ),
});

export function Members() {
  const { me, members } = useAppData();
  const { canAdminister } = usePermissions();
  const invitations = useLoaderData<typeof membersLoader>();
  // Only an Administrator gets the buttons, so the columns depend on the role.
  const memberColumnsFor = useMemo(
    () => (canAdminister ? [...memberColumns, memberActions] : memberColumns),
    [canAdminister],
  );
  const invitationColumnsFor = useMemo(
    () => (canAdminister ? [...invitationColumns, invitationActions] : invitationColumns),
    [canAdminister],
  );
  const result = useActionData<typeof membersAction>();
  const [inviting, setInviting] = useState(false);

  return (
    <>
      <PageHeader
        title="Members and settings"
        description="Every Member sees the whole ISMS. Their role decides what they can change. Only a risk's owner confirms that risk."
        actions={
          canAdminister && (
            <Button type="button" onClick={() => setInviting(true)}>
              Invite Member
            </Button>
          )
        }
      />
      <FormError message={result && 'error' in result ? result.error : undefined} />
      {inviting && (
        <InvitationDialog
          title="Invite a Member"
          intent="invite"
          submitLabel="Create invitation link"
          onClose={() => setInviting(false)}
        >
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoFocus />
          </Field>
          <Field label="Role" htmlFor="role">
            <NativeSelect id="role" name="role" defaultValue="editor">
              <RoleOptions />
            </NativeSelect>
          </Field>
          <p className="text-xs text-muted-foreground">Copy the link and send it yourself.</p>
        </InvitationDialog>
      )}

      <section className="flex flex-col gap-3">
        <h2>Members</h2>
        <DataTable
          columns={memberColumnsFor}
          data={members}
          getRowId={(member) => member.id}
          searchLabel="Search Members"
          emptyText="No Members yet."
        />
      </section>

      <section aria-label="Roles" className="flex flex-col gap-3">
        <h2>Roles</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {Object.entries(roleDescriptions).map(([role, description]) => (
            <div key={role} className="contents">
              <dt className="font-medium">{roleLabels[role as Role]}</dt>
              <dd className="text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Open invitations</h2>
        <DataTable
          columns={invitationColumnsFor}
          data={invitations}
          getRowId={(invitation) => invitation.id}
          paramPrefix="invitations-"
          emptyText="No open invitations."
        />
      </section>

      <section aria-label="Organization settings" className="flex flex-col gap-4">
        <SectionHeader title="Organization settings">
          {canAdminister && (
            <EditDialog title="Rename the Organization" label="Rename" size="md" intent="rename">
              <Field label="Organization name" htmlFor="organization-name">
                <Input
                  id="organization-name"
                  name="name"
                  defaultValue={me.organizationName}
                  required
                />
              </Field>
            </EditDialog>
          )}
        </SectionHeader>
        <Facts>
          <Fact label="Organization name">{me.organizationName}</Fact>
        </Facts>
      </section>

    </>
  );
}
