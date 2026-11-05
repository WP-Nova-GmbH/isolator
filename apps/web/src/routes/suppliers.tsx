import { Link, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { ImportButton } from '@/components/import-dialog';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import {
  DataCell,
  dataCell,
  EmptyRow,
  mainCell,
  NoValue,
  noteCell,
  RecordLink,
  Ref,
} from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { importAction } from '@/lib/imports';
import { useAppData, usePermissions } from '@/lib/members';
import { contractEndLabel, criticalityLabels, type Supplier } from '@/lib/suppliers';
import { UNASSIGNED, UNKNOWN } from '@/components/owner-select';

export async function suppliersLoader() {
  const [suppliers, ended] = await Promise.all([
    api<Supplier[]>('/suppliers'),
    api<Supplier[]>('/suppliers?state=ended'),
  ]);
  return { suppliers, ended };
}

export async function suppliersAction({ request }: ActionFunctionArgs) {
  return importAction('/suppliers', await request.formData());
}

const column = columnHelper<Supplier>();

const columns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('name', {
    header: 'Supplier',
    meta: { className: mainCell },
    cell: ({ row: { original: supplier } }) => (
      <>
        <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
        {supplier.provides && (
          <div className="line-clamp-1 text-xs text-muted-foreground" title={supplier.provides}>
            {supplier.provides}
          </div>
        )}
      </>
    ),
  }),
  column.accessor(
    (supplier) => (supplier.criticality ? criticalityLabels[supplier.criticality] : undefined),
    {
      id: 'criticality',
      header: 'Criticality',
      sortFn: sortByOrder(Object.keys(criticalityLabels), (supplier) => supplier.criticality),
      cell: ({ getValue }) => getValue() ?? <NoValue>{UNKNOWN}</NoValue>,
    },
  ),
  column.accessor('assetCount', {
    header: 'Assets',
    enableGlobalFilter: false,
    meta: { className: dataCell },
  }),
  // Sorts by the date; a rolling contract comes after every end date.
  column.accessor(
    (supplier) =>
      supplier.contractTerm === 'fixed'
        ? (supplier.contractEnds ?? undefined)
        : supplier.contractTerm === 'rolling'
          ? 'Rolling'
          : undefined,
    {
      id: 'contractEnds',
      header: 'Contract ends',
      meta: { className: dataCell },
      cell: ({ row }) => contractEndLabel(row.original),
    },
  ),
  column.accessor('nextReviewOn', { header: 'Next review', meta: { className: dataCell } }),
  column.accessor((supplier) => supplier.ownerName ?? undefined, {
    id: 'owner',
    header: 'Owner',
    cell: ({ getValue }) => getValue() ?? <NoValue>{UNASSIGNED}</NoValue>,
  }),
  column.accessor('state', {
    header: 'State',
    cell: ({ getValue }) => <StateBadge kind="supplier" state={getValue()} />,
  }),
]);

const endedColumns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('name', {
    header: 'Supplier',
    meta: { className: mainCell },
    cell: ({ row: { original: supplier } }) => (
      <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
    ),
  }),
  column.accessor((supplier) => supplier.endedAt?.slice(0, 10), {
    id: 'ended',
    header: 'Ended',
    meta: { className: dataCell },
  }),
  column.accessor('endedReason', { header: 'Why', meta: { className: noteCell } }),
]);

export function Suppliers() {
  const { canEdit } = usePermissions();
  const { suppliers, ended } = useLoaderData<typeof suppliersLoader>();
  const { me } = useAppData();
  const needsAttention = suppliers.filter((supplier) => supplier.attention.length > 0);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`Outside companies ${me.organizationName} relies on, and the assets each one provides.`}
        actions={
          canEdit && (
            <>
              <ImportButton records="Suppliers" path="/suppliers" refColumn="Ref" />
              <Button asChild>
                <Link to="/suppliers/new">Add Supplier</Link>
              </Button>
            </>
          )
        }
      />

      <section aria-label="Needs attention" className="flex flex-col gap-3">
        <h2>Needs attention</h2>
        <Table>
          <TableBody>
            {needsAttention.map((supplier) => (
              <TableRow key={supplier.ref}>
                <TableCell className="w-0">
                  <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
                </TableCell>
                <DataCell className="min-w-60 whitespace-normal">
                  {/* The dot trails each item, so a wrapped line starts with an item, not a dot. */}
                  <ul className="flex flex-wrap gap-x-2 gap-y-0.5 [&>li:not(:last-child)]:after:ml-2 [&>li:not(:last-child)]:after:content-['·']">
                    {supplier.attention.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </DataCell>
              </TableRow>
            ))}
            {needsAttention.length === 0 && (
              <EmptyRow colSpan={2}>Every Supplier is in order.</EmptyRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section aria-label="Supplier register" className="flex flex-col gap-3">
        <h2>Register</h2>
        <DataTable
          columns={columns}
          data={suppliers}
          getRowId={(supplier) => supplier.ref}
          searchLabel="Search Suppliers"
          emptyText="No Suppliers yet. Add the first one."
        />
      </section>

      {ended.length > 0 && (
        <section aria-label="Ended Suppliers" className="flex flex-col gap-3">
          <h2>Ended Suppliers</h2>
          <DataTable
            columns={endedColumns}
            data={ended}
            getRowId={(supplier) => supplier.ref}
            paramPrefix="ended-"
            emptyText="No ended Suppliers."
          />
        </section>
      )}
    </>
  );
}
