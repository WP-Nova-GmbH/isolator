import { useMemo } from 'react';
import { Link, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { ImportButton } from '@/components/import-dialog';
import { PageHeader } from '@/components/page-header';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import {
  dataCell,
  mainCell,
  NoValue,
  noteCell,
  RecordLink,
  Ref,
} from '@/components/table-parts';
import { Button } from '@/components/ui/button';
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

const refColumn = column.accessor('ref', {
  header: 'ID',
  cell: ({ getValue }) => <Ref>{getValue()}</Ref>,
});

const nameColumn = column.accessor('name', {
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
});

const criticalityColumn = column.accessor(
  (supplier) => (supplier.criticality ? criticalityLabels[supplier.criticality] : undefined),
  {
    id: 'criticality',
    header: 'Criticality',
    sortFn: sortByOrder(Object.keys(criticalityLabels), (supplier) => supplier.criticality),
    cell: ({ getValue }) => getValue() ?? <NoValue>{UNKNOWN}</NoValue>,
  },
);

const nextReviewColumn = column.accessor('nextReviewOn', {
  header: 'Next review',
  meta: { className: dataCell },
});

const ownerColumn = column.accessor((supplier) => supplier.ownerName ?? undefined, {
  id: 'owner',
  header: 'Owner',
  cell: ({ getValue }) => getValue() ?? <NoValue>{UNASSIGNED}</NoValue>,
});

const columns = column.columns([
  refColumn,
  nameColumn,
  criticalityColumn,
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
  nextReviewColumn,
  ownerColumn,
  column.accessor('state', {
    header: 'State',
    cell: ({ getValue }) => <StateBadge kind="supplier" state={getValue()} />,
  }),
]);

/** The Needs attention filter shows what each Supplier is missing in place of the contract. */
const attentionColumns = column.columns([
  refColumn,
  nameColumn,
  column.accessor((supplier) => supplier.attention.join(' · '), {
    id: 'attention',
    header: 'Needs attention',
    enableSorting: false,
    meta: { className: 'min-w-60 whitespace-normal text-muted-foreground' },
    cell: ({ row }) => (
      // The dot trails each item, so a wrapped line starts with an item, not a dot.
      <ul className="flex flex-wrap gap-x-2 gap-y-0.5 [&>li:not(:last-child)]:after:ml-2 [&>li:not(:last-child)]:after:content-['·']">
        {row.original.attention.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  }),
  criticalityColumn,
  nextReviewColumn,
  ownerColumn,
]);

/** What nobody has found out yet about a Supplier. */
function hasUnknowns(supplier: Supplier) {
  return (
    !supplier.ownerId ||
    !supplier.criticality ||
    supplier.handlesPersonalData === null ||
    !supplier.contractTerm
  );
}

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
  const needsAttention = useMemo(
    () => suppliers.filter((supplier) => supplier.attention.length > 0),
    [suppliers],
  );
  const { value, items } = useTabFilter([
    { value: 'all', label: 'All', count: suppliers.length },
    { value: 'attention', label: 'Needs attention', count: needsAttention.length },
  ]);
  const attention = value === 'attention';

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

      <StatGrid label="Supplier summary">
        <StatTile
          value={needsAttention.length}
          label={`of ${suppliers.length} Suppliers need attention`}
        />
        <StatTile
          value={suppliers.filter((supplier) => supplier.state === 'Review overdue').length}
          label="with a review overdue"
        />
        <StatTile value={suppliers.filter(hasUnknowns).length} label="with facts still unknown" />
      </StatGrid>

      <section aria-label="Supplier register" className="flex flex-col gap-3">
        <h2>Register</h2>
        <DataTable
          columns={attention ? attentionColumns : columns}
          data={attention ? needsAttention : suppliers}
          getRowId={(supplier) => supplier.ref}
          filters={<TabNav label="Supplier register filter" items={items} />}
          searchLabel="Search Suppliers"
          emptyText={
            attention ? 'Every Supplier is in order.' : 'No Suppliers yet. Add the first one.'
          }
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
