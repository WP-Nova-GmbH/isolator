import { Link, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { ImportButton } from '@/components/import-dialog';
import { PageHeader } from '@/components/page-header';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import { dataCell, mainCell, NoValue, noteCell, RecordLink } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { UNASSIGNED, UNKNOWN } from '@/components/owner-select';
import { api } from '@/lib/api';
import { assetTypeLabels, classificationLabels, type Asset } from '@/lib/assets';
import { importAction } from '@/lib/imports';
import { useAppData, usePermissions } from '@/lib/members';

export async function assetsLoader() {
  const [assets, retired] = await Promise.all([
    api<Asset[]>('/assets'),
    api<Asset[]>('/assets?state=retired'),
  ]);
  return { assets, retired };
}

export async function assetsAction({ request }: ActionFunctionArgs) {
  return importAction('/assets', await request.formData());
}

const column = columnHelper<Asset>();

const columns = column.columns([
  column.accessor('name', {
    header: 'Asset',
    meta: { className: mainCell },
    cell: ({ row }) => (
      <>
        <RecordLink to={`/assets/${row.original.id}`}>{row.original.name}</RecordLink>
        <AssetNote asset={row.original} />
      </>
    ),
  }),
  column.accessor((asset) => assetTypeLabels[asset.type], { id: 'type', header: 'Type' }),
  column.accessor(
    (asset) => (asset.classification ? classificationLabels[asset.classification] : undefined),
    {
      id: 'classification',
      header: 'Classification',
      sortFn: sortByOrder(Object.keys(classificationLabels), (asset) => asset.classification),
      cell: ({ getValue }) => getValue() ?? <NoValue>{UNKNOWN}</NoValue>,
    },
  ),
  column.accessor((asset) => asset.ownerName ?? undefined, {
    id: 'owner',
    header: 'Business owner',
    cell: ({ getValue }) => getValue() ?? <NoValue>{UNASSIGNED}</NoValue>,
  }),
  column.accessor((asset) => asset.suppliers.map((supplier) => supplier.name).join(', ') || undefined, {
    id: 'suppliers',
    header: 'Suppliers',
    cell: ({ row }) =>
      row.original.suppliers.length > 0 ? (
        row.original.suppliers.map((supplier, index) => (
          <span key={supplier.ref}>
            {index > 0 && ', '}
            <RecordLink to={`/suppliers/${supplier.ref}`} className="font-normal">
              {supplier.name}
            </RecordLink>
          </span>
        ))
      ) : (
        <NoValue>None</NoValue>
      ),
  }),
  column.accessor('risks', {
    header: 'Open risks',
    enableGlobalFilter: false,
    meta: { className: dataCell },
  }),
]);

const retiredColumns = column.columns([
  column.accessor('name', {
    header: 'Asset',
    meta: { className: mainCell },
    cell: ({ row: { original: asset } }) => (
      <RecordLink to={`/assets/${asset.id}`}>{asset.name}</RecordLink>
    ),
  }),
  column.accessor((asset) => asset.ownerName ?? undefined, {
    id: 'owner',
    header: 'Owner',
    cell: ({ getValue }) => getValue() ?? <NoValue>{UNASSIGNED}</NoValue>,
  }),
  column.accessor((asset) => asset.retiredAt?.slice(0, 10), {
    id: 'retired',
    header: 'Retired',
    meta: { className: dataCell },
  }),
  column.accessor('retiredReason', { header: 'Why', meta: { className: noteCell } }),
]);

/** What still has to happen before the record can be relied on. */
function AssetNote({ asset }: { asset: Asset }) {
  const note = [
    asset.status === 'planned' && 'Planned',
    asset.validation === 'unvalidated' && 'Not validated',
  ].filter(Boolean);
  if (note.length === 0) return null;
  return <div className="text-xs text-muted-foreground">{note.join(' · ')}</div>;
}

export function Assets() {
  const { canEdit } = usePermissions();
  const { assets, retired } = useLoaderData<typeof assetsLoader>();
  const { me } = useAppData();

  return (
    <>
      <PageHeader
        title="Assets"
        description={`What ${me.organizationName} needs to protect, who owns it, and which Suppliers it depends on.`}
        actions={
          canEdit && (
            <>
              <ImportButton
                records="assets"
                path="/assets"
                refColumn="ID"
                note="Import your Suppliers first, so the Suppliers column can name them."
              />
              <Button asChild>
                <Link to="/assets/new">Add asset</Link>
              </Button>
            </>
          )
        }
      />
      <DataTable
        columns={columns}
        data={assets}
        getRowId={(asset) => asset.id}
        searchLabel="Search assets"
        emptyText="No assets yet. Add the first one."
      />

      {retired.length > 0 && (
        <section aria-label="Retired assets" className="flex flex-col gap-3">
          <h2>Retired assets</h2>
          <DataTable
            columns={retiredColumns}
            data={retired}
            getRowId={(asset) => asset.id}
            paramPrefix="retired-"
            emptyText="No retired assets."
          />
        </section>
      )}
    </>
  );
}
