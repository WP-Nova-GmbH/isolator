import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref } from '@/components/table-parts';
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
import type { Incident } from '@/lib/incidents';

const tabs = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function incidentsLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get('tab') ?? 'open';
  return api<Incident[]>(tab === 'all' ? '/incidents' : `/incidents?state=${tab}`);
}

export function Incidents() {
  const incidents = useLoaderData<typeof incidentsLoader>();
  const { items } = useTabFilter(tabs);

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Security events that happened, and how you handled them."
        actions={
          <Button asChild>
            <Link to="/incidents/new">Report incident</Link>
          </Button>
        }
      />
      <TabNav label="Incident filter" items={items} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>What happened</TableHead>
            <TableHead>Occurred</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Linked risk</TableHead>
            <TableHead>Closed by</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidents.map((incident) => (
            <TableRow key={incident.ref}>
              <TableCell>
                <Ref>{incident.ref}</Ref>
              </TableCell>
              <MainCell>
                <RecordLink to={`/incidents/${incident.ref}`}>{incident.title}</RecordLink>
              </MainCell>
              <DataCell>{incident.occurredOn}</DataCell>
              <TableCell>{incident.ownerName}</TableCell>
              {incident.risk ? (
                <TableCell>
                  <RecordLink to={`/risks/${incident.risk.ref}`} className="font-normal">
                    {incident.risk.ref}
                  </RecordLink>
                </TableCell>
              ) : (
                <DataCell>None</DataCell>
              )}
              <DataCell>
                {incident.closedAt
                  ? `${incident.closedBy}, ${incident.closedAt.slice(0, 10)}`
                  : 'Not closed'}
              </DataCell>
              <TableCell>
                <StateBadge kind="incident" state={incident.state} />
              </TableCell>
            </TableRow>
          ))}
          {incidents.length === 0 && <EmptyRow colSpan={7}>No Incidents here.</EmptyRow>}
        </TableBody>
      </Table>
    </>
  );
}
