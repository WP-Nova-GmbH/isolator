import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable } from '@/components/data-table';
import { dataCell, mainCell, NoValue, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import type { Incident } from '@/lib/incidents';

const tabs = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

const column = columnHelper<Incident>();

const columns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', {
    header: 'What happened',
    meta: { className: mainCell },
    cell: ({ row: { original: incident } }) => (
      <RecordLink to={`/incidents/${incident.ref}`}>{incident.title}</RecordLink>
    ),
  }),
  column.accessor('occurredOn', { header: 'Occurred', meta: { className: dataCell } }),
  column.accessor('ownerName', { id: 'owner', header: 'Owner' }),
  column.accessor((incident) => incident.risk?.ref, {
    id: 'risk',
    header: 'Linked risk',
    cell: ({ getValue }) => {
      const ref = getValue();
      return ref ? (
        <RecordLink to={`/risks/${ref}`} className="font-normal">
          {ref}
        </RecordLink>
      ) : (
        <NoValue>None</NoValue>
      );
    },
  }),
  column.accessor((incident) => incident.closedAt ?? undefined, {
    id: 'closed',
    header: 'Closed by',
    meta: { className: dataCell },
    cell: ({ row: { original: incident } }) =>
      incident.closedAt ? `${incident.closedBy}, ${incident.closedAt.slice(0, 10)}` : 'Not closed',
  }),
  column.accessor('state', {
    header: 'State',
    cell: ({ getValue }) => <StateBadge kind="incident" state={getValue()} />,
  }),
]);

export function incidentsLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get('tab') ?? 'open';
  return api<Incident[]>(tab === 'all' ? '/incidents' : `/incidents?state=${tab}`);
}

export function Incidents() {
  const { canEdit } = usePermissions();
  const incidents = useLoaderData<typeof incidentsLoader>();
  const { items } = useTabFilter(tabs);

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Security events that happened, and how you handled them."
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/incidents/new">Report incident</Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={incidents}
        getRowId={(incident) => incident.ref}
        filters={<TabNav label="Incident filter" items={items} />}
        searchLabel="Search Incidents"
        emptyText="No Incidents here."
      />
    </>
  );
}
