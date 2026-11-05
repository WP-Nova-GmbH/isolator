import { useMemo, useState } from 'react';
import { useLoaderData, type ActionFunctionArgs } from 'react-router';
import { Field } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import { dataCell, mainCell, NoValue, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, attempt } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import { controlState, statusLabels, type SoaEntry } from '@/lib/soa';
import { useFormFetcher } from '@/lib/use-form-fetcher';

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'organizational', label: 'Organizational' },
  { value: 'people', label: 'People' },
  { value: 'physical', label: 'Physical' },
  { value: 'technological', label: 'Technological' },
  { value: 'own', label: 'Own controls' },
];

export function soaLoader() {
  return api<SoaEntry[]>('/soa');
}

export async function soaAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return attempt(() => api('/soa', { method: 'POST', body: { title: form.get('title') } }));
}

function secondLine(entry: SoaEntry) {
  if (entry.own) return 'Own control';
  return entry.applicable ? null : entry.justification;
}

const column = columnHelper<SoaEntry>();

const columns = column.columns([
  column.accessor('ref', { header: 'Ref', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', {
    header: 'Control',
    meta: { className: mainCell },
    cell: ({ row: { original: entry } }) => (
      <>
        <RecordLink to={`/soa/${entry.ref}`}>{entry.title}</RecordLink>
        {secondLine(entry) && (
          <div className="text-xs text-muted-foreground">{secondLine(entry)}</div>
        )}
      </>
    ),
  }),
  column.accessor((entry) => (entry.applicable ? 'Yes' : 'No'), { id: 'applies', header: 'Applies' }),
  column.accessor((entry) => controlState(entry), {
    id: 'status',
    header: 'Status',
    // From not started to implemented, with excluded controls last.
    sortFn: sortByOrder<SoaEntry>([...Object.values(statusLabels), 'Not applicable'], controlState),
    cell: ({ getValue }) => <StateBadge kind="control" state={getValue()} />,
  }),
  column.accessor((entry) => entry.ownerName ?? undefined, {
    id: 'owner',
    header: 'Owner',
    cell: ({ getValue }) => getValue() ?? <NoValue>None</NoValue>,
  }),
  column.accessor('evidenceCount', {
    id: 'evidence',
    header: 'Evidence',
    enableGlobalFilter: false,
    cell: ({ row: { original: entry } }) =>
      entry.expiredEvidence > 0 ? (
        <StateBadge kind="evidence" state="Expired" label={`${entry.expiredEvidence} expired`} />
      ) : (
        <span className={dataCell}>{entry.evidenceCount}</span>
      ),
  }),
  column.accessor((entry) => (entry.confirmation ? 'Confirmed' : 'Draft'), {
    id: 'confirmation',
    header: 'Confirmation',
    cell: ({ getValue }) => <StateBadge kind="confirmation" state={getValue()} />,
  }),
]);

function OwnControlForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title="Add own control" onClose={onClose}>
      <fetcher.Form method="post" className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <Field label="What the control is" htmlFor="own-title">
            <Input id="own-title" name="title" required autoFocus />
          </Field>
        </FormDialogBody>
        <FormDialogFooter>
          <Button type="submit" disabled={fetcher.state !== 'idle'}>
            Add control
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

export function Soa() {
  const { canEdit } = usePermissions();
  const all = useLoaderData<typeof soaLoader>();
  const { value, items } = useTabFilter(tabs);
  const [adding, setAdding] = useState(false);
  const entries = useMemo(
    () => (value === 'all' ? all : all.filter((entry) => entry.theme === value)),
    [all, value],
  );

  return (
    <>
      <PageHeader
        title="Statement of Applicability"
        description="One entry per control, including your own."
        actions={
          canEdit && (
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              Add own control
            </Button>
          )
        }
      />
      {adding && <OwnControlForm onClose={() => setAdding(false)} />}

      <StatGrid label="SoA summary">
        <StatTile
          value={all.filter((entry) => entry.confirmation).length}
          label={`of ${all.length} entries confirmed`}
        />
        <StatTile
          value={all.filter((entry) => !entry.justification).length}
          label="without a justification"
        />
        <StatTile value={all.filter((entry) => !entry.ownerId).length} label="without an owner" />
        <StatTile
          value={all.filter((entry) => entry.expiredEvidence > 0).length}
          label="with expired Evidence"
        />
      </StatGrid>

      <DataTable
        columns={columns}
        data={entries}
        getRowId={(entry) => entry.ref}
        filters={<TabNav label="Control themes" items={items} />}
        searchLabel="Search controls"
        emptyText="No entries here."
      />
    </>
  );
}
