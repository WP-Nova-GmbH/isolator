import { Link, useLoaderData, useSearchParams } from 'react-router';
import { DocumentKindOptions } from '@/components/document-fields';
import { UNKNOWN } from '@/components/owner-select';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { DataCell, EmptyRow, MainCell, RecordLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
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

export async function documentsLoader() {
  const [documents, withdrawn] = await Promise.all([
    api<IsmsDocument[]>('/documents'),
    api<IsmsDocument[]>('/documents?state=withdrawn'),
  ]);
  return { documents, withdrawn };
}

export function Documents() {
  const { documents, withdrawn } = useLoaderData<typeof documentsLoader>();
  // ?tab= as on other lists, so the readiness checklist can link to one kind.
  const [params, setParams] = useSearchParams();
  const value = params.get('tab') ?? 'all';
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
      <div className="flex items-center gap-2 self-start">
        <Label htmlFor="document-kind" className="shrink-0">
          Kind
        </Label>
        <NativeSelect
          id="document-kind"
          value={value}
          onChange={(event) =>
            setParams(event.target.value === 'all' ? {} : { tab: event.target.value })
          }
        >
          <option value="all">All kinds</option>
          <DocumentKindOptions />
        </NativeSelect>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Dated</TableHead>
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
              <DataCell>{doc.datedOn ?? UNKNOWN}</DataCell>
              <TableCell>{doc.ownerName}</TableCell>
              <DataCell>{doc.lastConfirmedAt?.slice(0, 10) ?? 'None'}</DataCell>
              <TableCell>
                <StateBadge kind="document" state={doc.state} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={7}>No Documents of this kind yet.</EmptyRow>}
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
