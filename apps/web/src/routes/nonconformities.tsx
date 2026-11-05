import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable } from '@/components/data-table';
import { dataCell, mainCell, noteCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import type { Nonconformity } from '@/lib/nonconformities';

const tabs = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

const column = columnHelper<Nonconformity>();

const columns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', {
    header: 'What falls short',
    meta: { className: mainCell },
    cell: ({ row: { original: item } }) => (
      <RecordLink to={`/nonconformities/${item.ref}`}>{item.title}</RecordLink>
    ),
  }),
  column.accessor('foundIn', { header: 'Found in', meta: { className: noteCell } }),
  column.accessor('ownerName', { id: 'owner', header: 'Owner' }),
  column.accessor('openTasks', {
    header: 'Tasks',
    enableGlobalFilter: false,
    meta: { className: dataCell },
    cell: ({ getValue }) => (getValue() > 0 ? `${getValue()} open` : 'None open'),
  }),
  column.accessor((item) => item.closedAt ?? undefined, {
    id: 'closed',
    header: 'Closed by',
    meta: { className: dataCell },
    cell: ({ row: { original: item } }) =>
      item.closedAt ? `${item.closedBy}, ${item.closedAt.slice(0, 10)}` : 'Not closed',
  }),
  column.accessor('state', {
    header: 'State',
    cell: ({ getValue }) => <StateBadge kind="nonconformity" state={getValue()} />,
  }),
]);

export function nonconformitiesLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get('tab') ?? 'open';
  return api<Nonconformity[]>(tab === 'all' ? '/nonconformities' : `/nonconformities?state=${tab}`);
}

export function Nonconformities() {
  const { canEdit } = usePermissions();
  const nonconformities = useLoaderData<typeof nonconformitiesLoader>();
  const { items } = useTabFilter(tabs);

  return (
    <>
      <PageHeader
        title="Nonconformities"
        description="Where the ISMS falls short, and the Tasks that correct it."
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/nonconformities/new">Add Nonconformity</Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={nonconformities}
        getRowId={(item) => item.ref}
        filters={<TabNav label="Nonconformity filter" items={items} />}
        searchLabel="Search Nonconformities"
        emptyText="No Nonconformities here."
      />
    </>
  );
}
