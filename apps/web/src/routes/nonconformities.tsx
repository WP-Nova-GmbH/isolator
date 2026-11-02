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
import type { Nonconformity } from '@/lib/nonconformities';

const tabs = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function nonconformitiesLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get('tab') ?? 'open';
  return api<Nonconformity[]>(tab === 'all' ? '/nonconformities' : `/nonconformities?state=${tab}`);
}

export function Nonconformities() {
  const nonconformities = useLoaderData<typeof nonconformitiesLoader>();
  const { items } = useTabFilter(tabs);

  return (
    <>
      <PageHeader
        title="Nonconformities"
        description="Where the ISMS falls short, and the Tasks that correct it."
        actions={
          <Button asChild>
            <Link to="/nonconformities/new">Add Nonconformity</Link>
          </Button>
        }
      />
      <TabNav label="Nonconformity filter" items={items} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>What falls short</TableHead>
            <TableHead>Found in</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead>Closed by</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nonconformities.map((item) => (
            <TableRow key={item.ref}>
              <TableCell>
                <Ref>{item.ref}</Ref>
              </TableCell>
              <MainCell>
                <RecordLink to={`/nonconformities/${item.ref}`}>{item.title}</RecordLink>
              </MainCell>
              <DataCell className="min-w-40 whitespace-normal">{item.foundIn}</DataCell>
              <TableCell>{item.ownerName}</TableCell>
              <DataCell>{item.openTasks > 0 ? `${item.openTasks} open` : 'None open'}</DataCell>
              <DataCell>
                {item.closedAt ? `${item.closedBy}, ${item.closedAt.slice(0, 10)}` : 'Not closed'}
              </DataCell>
              <TableCell>
                <StateBadge kind="nonconformity" state={item.state} />
              </TableCell>
            </TableRow>
          ))}
          {nonconformities.length === 0 && (
            <EmptyRow colSpan={7}>No Nonconformities here.</EmptyRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
