import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable } from '@/components/data-table';
import { dataCell, mainCell, noteCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  auditTrailCsv,
  describeEvent,
  eventTime,
  recordPath,
  type AuditEvent,
  type AuditTrail as Trail,
} from '@/lib/audit';
import { readTableParams } from '@/lib/table-params';

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'soa', label: 'SoA' },
  { value: 'risks', label: 'Risks' },
  { value: 'documents', label: 'Documents' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'assets', label: 'Assets' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'nonconformities', label: 'Nonconformities' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'files', label: 'Files' },
  { value: 'members', label: 'Members' },
];

/** One page of the trail, newest first. The server pages and searches it. */
export async function auditTrailLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') ?? 'all';
  const { q, pageIndex, pageSize } = readTableParams(url.searchParams);
  const query = new URLSearchParams({
    limit: String(pageSize),
    offset: String(pageIndex * pageSize),
  });
  if (tab !== 'all') query.set('area', tab);
  if (q.trim()) query.set('q', q.trim());
  return api<Trail>(`/audit-events?${query}`);
}

async function exportCsv() {
  const { events } = await api<Trail>('/audit-events');
  const url = URL.createObjectURL(new Blob([auditTrailCsv(events)], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `isolator-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RecordName({ event }: { event: AuditEvent }) {
  const path = recordPath(event);
  return (
    <span className="flex items-baseline gap-2">
      {event.recordRef && <Ref>{event.recordRef}</Ref>}
      {path ? (
        <RecordLink to={path} className="font-normal">
          {event.recordLabel}
        </RecordLink>
      ) : (
        event.recordLabel
      )}
    </span>
  );
}

const column = columnHelper<AuditEvent>();

const columns = column.columns([
  column.accessor((event) => eventTime(event), {
    id: 'when',
    header: 'When (UTC)',
    meta: { className: dataCell },
  }),
  column.accessor('memberName', { id: 'who', header: 'Who' }),
  column.accessor('recordLabel', {
    id: 'record',
    header: 'Record',
    meta: { className: mainCell },
    cell: ({ row }) => <RecordName event={row.original} />,
  }),
  column.accessor((event) => describeEvent(event), {
    id: 'what',
    header: 'What happened',
    meta: { className: mainCell },
  }),
  column.accessor('reason', { id: 'why', header: 'Why', meta: { className: noteCell } }),
]);

export function AuditTrail() {
  const { events, total } = useLoaderData<typeof auditTrailLoader>();
  const { items } = useTabFilter(tabs);

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Who changed what, when and why. Entries can't be edited or removed."
        actions={
          <Button type="button" variant="outline" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={events}
        rowCount={total}
        getRowId={(event) => event.id}
        filters={<TabNav label="Audit trail filter" items={items} />}
        searchLabel="Search who, record or why"
        emptyText="Nothing here yet."
      />
    </>
  );
}
