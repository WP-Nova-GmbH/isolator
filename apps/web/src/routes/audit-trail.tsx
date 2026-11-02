import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref, TextLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import {
  auditTrailCsv,
  describeEvent,
  eventTime,
  recordPath,
  type AuditEvent,
  type AuditTrail as Trail,
} from '@/lib/audit';

const PAGE_SIZE = 200;

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

export async function auditTrailLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') ?? 'all';
  const limit = Number(url.searchParams.get('limit')) || PAGE_SIZE;
  const query = new URLSearchParams({ limit: String(limit) });
  if (tab !== 'all') query.set('area', tab);
  return { ...(await api<Trail>(`/audit-events?${query}`)), tab, limit };
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

function RecordCell({ event }: { event: AuditEvent }) {
  const path = recordPath(event);
  return (
    <MainCell>
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
    </MainCell>
  );
}

export function AuditTrail() {
  const { events, total, tab, limit } = useLoaderData<typeof auditTrailLoader>();
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
      <TabNav label="Audit trail filter" items={items} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When (UTC)</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Record</TableHead>
            <TableHead>What happened</TableHead>
            <TableHead>Why</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <DataCell>{eventTime(event)}</DataCell>
              <TableCell>{event.memberName}</TableCell>
              <RecordCell event={event} />
              <MainCell>{describeEvent(event)}</MainCell>
              <DataCell className="min-w-40 whitespace-normal">{event.reason}</DataCell>
            </TableRow>
          ))}
          {events.length === 0 && <EmptyRow colSpan={5}>Nothing here yet.</EmptyRow>}
        </TableBody>
      </Table>
      {events.length < total && (
        <TextLink to={`?tab=${tab}&limit=${limit + PAGE_SIZE}`} preventScrollReset className="self-start">
          Show older entries
        </TextLink>
      )}
    </>
  );
}
