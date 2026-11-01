import { Link, useLoaderData } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, RecordLink } from '@/components/table-parts';
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
import { documentKindLabels, type IsmsDocument } from '@/lib/documents';

const tabs = [
  { value: 'all', label: 'All' },
  ...Object.entries(documentKindLabels).map(([value, label]) => ({ value, label })),
];

export async function documentsLoader() {
  const [documents, withdrawn] = await Promise.all([
    api<IsmsDocument[]>('/documents'),
    api<IsmsDocument[]>('/documents?state=withdrawn'),
  ]);
  return { documents, withdrawn };
}

export function Documents() {
  const { documents, withdrawn } = useLoaderData<typeof documentsLoader>();
  const { value, items } = useTabFilter(tabs);
  const rows = value === 'all' ? documents : documents.filter((doc) => doc.kind === value);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Everything you maintain for the audit file. Each version needs a Confirmation."
        actions={
          <Button asChild>
            <Link to="/documents/new">New Document</Link>
          </Button>
        }
      />
      <TabNav label="Document kinds" items={items} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Last Confirmation</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((doc) => (
            <TableRow key={doc.id}>
              <MainCell>
                <RecordLink to={`/documents/${doc.id}`}>{doc.title}</RecordLink>
              </MainCell>
              <TableCell>{documentKindLabels[doc.kind]}</TableCell>
              <DataCell>{doc.version}</DataCell>
              <TableCell>{doc.ownerName}</TableCell>
              <DataCell>{doc.lastConfirmedAt?.slice(0, 10) ?? 'None'}</DataCell>
              <TableCell>
                <StateBadge kind="document" state={doc.state} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={6}>No Documents of this kind yet.</EmptyRow>}
        </TableBody>
      </Table>

      {withdrawn.length > 0 && (
        <section aria-label="Withdrawn Documents" className="flex flex-col gap-3">
          <h2>Withdrawn Documents</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Withdrawn</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawn.map((doc) => (
                <TableRow key={doc.id}>
                  <MainCell>
                    <RecordLink to={`/documents/${doc.id}`}>{doc.title}</RecordLink>
                  </MainCell>
                  <DataCell>{doc.withdrawnAt?.slice(0, 10)}</DataCell>
                  <DataCell className="min-w-40 whitespace-normal">{doc.withdrawnReason}</DataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
