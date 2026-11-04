import { useState } from 'react';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
  type ActionFunctionArgs,
} from 'react-router';
import { CopyLink } from '@/components/copy-link';
import { Field, FieldGrid } from '@/components/field';
import { FormError } from '@/components/form-error';
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

/** Changes a Member's role as soon as another one is chosen. A refusal shows at the top. */
function RoleSelect({ member }: { member: Member }) {
  const submit = useSubmit();
  const { formData } = useNavigation();
  const pending =
    formData?.get('intent') === 'change-role' && formData.get('id') === member.id
      ? (formData.get('role') as Role)
      : undefined;

  return (
    <NativeSelect
      aria-label={`Role of ${member.name}`}
      className="h-7 w-36"
      value={pending ?? member.role}
      disabled={pending !== undefined}
      onChange={(event) =>
        submit(
          { intent: 'change-role', id: member.id, role: event.target.value },
          { method: 'post', preventScrollReset: true },
        )
      }
    >
      <RoleOptions />
    </NativeSelect>
  );
}

function RemoveMember({ member }: { member: Member }) {
  const [removing, setRemoving] = useState(false);

  if (!removing) {
    return (
      <Button type="button" variant="ghost" size="xs" onClick={() => setRemoving(true)}>
        Remove
      </Button>
    );
  }
  return (
    <Form method="post" preventScrollReset className="flex items-center justify-end gap-1">
      <input type="hidden" name="id" value={member.id} />
      <Input
        name="reason"
        aria-label={`Why is ${member.name} leaving?`}
        placeholder="Why are they leaving?"
        className="h-7 w-56"
        required
        autoFocus
      />
      <Button type="submit" name="intent" value="remove" variant="destructive" size="xs">
        Remove
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={() => setRemoving(false)}>
        Keep
      </Button>
    </Form>
  );
}

export function Members() {
  const { me, members } = useAppData();
  const { canAdminister } = usePermissions();
  const invitations = useLoaderData<typeof membersLoader>();
  const result = useActionData<typeof membersAction>();
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle';

  return (
    <>
      <PageHeader
        title="Members and settings"
        description="Every Member sees the whole ISMS. Their role decides what they can change. Only a risk's owner confirms that risk."
      />
      <FormError message={result && 'error' in result ? result.error : undefined} />
      {result && 'link' in result && <CopyLink link={result.link} />}

      {canAdminister && (
        <Card aria-label="Invite a Member" className="flex flex-col gap-4">
          <h2>Invite a Member</h2>
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <Field label="Email" htmlFor="email" className="flex-[1_1_17.5rem]">
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field label="Role" htmlFor="role" className="flex-[0_1_11rem]">
              <NativeSelect id="role" name="role" defaultValue="editor">
                <RoleOptions />
              </NativeSelect>
            </Field>
            <Button type="submit" name="intent" value="invite" disabled={saving}>
              Create invitation link
            </Button>
          </Form>
          <p className="text-xs text-muted-foreground">Copy the link and send it yourself.</p>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2>Members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Risks owned</TableHead>
              <TableHead>Joined</TableHead>
              {canAdminister && <TableHead className="sr-only">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <MainCell className="font-medium">{member.name}</MainCell>
                <DataCell>{member.email}</DataCell>
                {canAdminister ? (
                  <TableCell className="py-0">
                    <RoleSelect member={member} />
                  </TableCell>
                ) : (
                  <TableCell>{roleLabels[member.role]}</TableCell>
                )}
                <DataCell>{member.risksOwned}</DataCell>
                <DataCell>{member.joinedAt.slice(0, 10)}</DataCell>
                {canAdminister && (
                  <TableCell className="py-0 text-right">
                    {member.id !== me.id && <RemoveMember member={member} />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Expires</TableHead>
              {canAdminister && <TableHead className="sr-only">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <MainCell>{invitation.email}</MainCell>
                <TableCell>{roleLabels[invitation.role]}</TableCell>
                <TableCell>{invitation.invitedBy}</TableCell>
                <DataCell>{invitation.expiresAt.slice(0, 10)}</DataCell>
                {canAdminister && (
                  <TableCell className="py-0 text-right">
                    <Form method="post">
                      <input type="hidden" name="id" value={invitation.id} />
                      <Button type="submit" name="intent" value="revoke" variant="ghost" size="xs">
                        Revoke
                      </Button>
                    </Form>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {invitations.length === 0 && (
              <EmptyRow colSpan={canAdminister ? 5 : 4}>No open invitations.</EmptyRow>
            )}
          </TableBody>
        </Table>
      </section>

      <Card aria-label="Organization settings" className="flex flex-col gap-4">
        <h2>Organization settings</h2>
        <Form method="post" className="flex flex-col gap-4">
          <fieldset disabled={!canAdminister} className="contents">
            <FieldGrid>
              <Field label="Organization name" htmlFor="organization-name">
                <Input
                  key={me.organizationName}
                  id="organization-name"
                  name="name"
                  defaultValue={me.organizationName}
                  required
                />
              </Field>
            </FieldGrid>
          </fieldset>
          {canAdminister && (
            <div>
              <Button type="submit" name="intent" value="rename" variant="outline" disabled={saving}>
                Save settings
              </Button>
            </div>
          )}
        </Form>
      </Card>

    </>
  );
}
