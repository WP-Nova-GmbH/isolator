import { useMemo } from 'react';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { columnHelper, DataTable } from '@/components/data-table';
import { DocumentKindOptions } from '@/components/document-fields';
import { UNKNOWN } from '@/components/owner-select';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { tabSearch } from '@/components/tab-nav';
import { dataCell, mainCell, noteCell, RecordLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import { documentKindLabels, type IsmsDocument } from '@/lib/documents';

export async function documentsLoader() {
  const [documents, withdrawn] = await Promise.all([
    api<IsmsDocument[]>('/documents'),
    api<IsmsDocument[]>('/documents?state=withdrawn'),
  ]);
  return { documents, withdrawn };
}

const column = columnHelper<IsmsDocument>();

const columns = column.columns([
  column.accessor('title', {
    header: 'Document',
    meta: { className: mainCell },
    cell: ({ row: { original: doc } }) => (
      <RecordLink to={`/documents/${doc.id}`}>{doc.title}</RecordLink>
    ),
  }),
  column.accessor((doc) => documentKindLabels[doc.kind], { id: 'kind', header: 'Kind' }),
  column.accessor('version', {
    header: 'Version',
    enableGlobalFilter: false,
    meta: { className: dataCell },
  }),
  column.accessor((doc) => doc.datedOn ?? undefined, {
    id: 'dated',
    header: 'Dated',
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? UNKNOWN,
  }),
  column.accessor('ownerName', { id: 'owner', header: 'Owner' }),
  column.accessor((doc) => doc.lastConfirmedAt?.slice(0, 10), {
    id: 'confirmed',
    header: 'Last Confirmation',
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? 'None',
  }),
  column.accessor('state', {
    header: 'State',
    cell: ({ getValue }) => <StateBadge kind="document" state={getValue()} />,
  }),
]);

const withdrawnColumns = column.columns([
  column.accessor('title', {
    header: 'Document',
    meta: { className: mainCell },
    cell: ({ row: { original: doc } }) => (
      <RecordLink to={`/documents/${doc.id}`}>{doc.title}</RecordLink>
    ),
  }),
  column.accessor((doc) => doc.withdrawnAt?.slice(0, 10), {
    id: 'withdrawn',
    header: 'Withdrawn',
    meta: { className: dataCell },
  }),
  column.accessor('withdrawnReason', { header: 'Why', meta: { className: noteCell } }),
]);

export function Documents() {
  const { canEdit } = usePermissions();
  const { documents, withdrawn } = useLoaderData<typeof documentsLoader>();
  // ?tab= as on other lists, so the readiness checklist can link to one kind.
  const [params, setParams] = useSearchParams();
  const value = params.get('tab') ?? 'all';
  const rows = useMemo(
    () => (value === 'all' ? documents : documents.filter((doc) => doc.kind === value)),
    [documents, value],
  );

  return (
    <>
      <PageHeader
        title="Documents"
        description="Everything you maintain for the audit file. Each version needs a Confirmation."
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/documents/new">New Document</Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(doc) => doc.id}
        filters={
          <div className="flex items-center gap-2">
            <Label htmlFor="document-kind" className="shrink-0">
              Kind
            </Label>
            <NativeSelect
              id="document-kind"
              value={value}
              onChange={(event) =>
                setParams(tabSearch(params, event.target.value === 'all' ? null : event.target.value))
              }
            >
              <option value="all">All kinds</option>
              <DocumentKindOptions />
            </NativeSelect>
          </div>
        }
        searchLabel="Search Documents"
        emptyText="No Documents of this kind yet."
      />

      {withdrawn.length > 0 && (
        <section aria-label="Withdrawn Documents" className="flex flex-col gap-3">
          <h2>Withdrawn Documents</h2>
          <DataTable
            columns={withdrawnColumns}
            data={withdrawn}
            getRowId={(doc) => doc.id}
            paramPrefix="withdrawn-"
            emptyText="No withdrawn Documents."
          />
        </section>
      )}
    </>
  );
}
