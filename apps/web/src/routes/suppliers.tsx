import { Link, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { ImportButton } from '@/components/import-dialog';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Assets</TableHead>
              <TableHead>Contract ends</TableHead>
              <TableHead>Next review</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.ref}>
                <TableCell>
                  <Ref>{supplier.ref}</Ref>
                </TableCell>
                <MainCell>
                  <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
                  {supplier.provides && (
                    <div className="line-clamp-1 text-xs text-muted-foreground" title={supplier.provides}>
                      {supplier.provides}
                    </div>
                  )}
                </MainCell>
                {supplier.criticality ? (
                  <TableCell>{criticalityLabels[supplier.criticality]}</TableCell>
                ) : (
                  <DataCell>{UNKNOWN}</DataCell>
                )}
                <DataCell>{supplier.assetCount}</DataCell>
                <DataCell>{contractEndLabel(supplier)}</DataCell>
                <DataCell>{supplier.nextReviewOn}</DataCell>
                {supplier.ownerName ? (
                  <TableCell>{supplier.ownerName}</TableCell>
                ) : (
                  <DataCell>{UNASSIGNED}</DataCell>
                )}
                <TableCell>
                  <StateBadge kind="supplier" state={supplier.state} />
                </TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && (
              <EmptyRow colSpan={8}>No Suppliers yet. Add the first one.</EmptyRow>
            )}
          </TableBody>
        </Table>
      </section>

      {ended.length > 0 && (
        <section aria-label="Ended Suppliers" className="flex flex-col gap-3">
          <h2>Ended Suppliers</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ended.map((supplier) => (
                <TableRow key={supplier.ref}>
                  <TableCell>
                    <Ref>{supplier.ref}</Ref>
                  </TableCell>
                  <MainCell>
                    <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
                  </MainCell>
                  <DataCell>{supplier.endedAt?.slice(0, 10)}</DataCell>
                  <DataCell className="min-w-40 whitespace-normal">{supplier.endedReason}</DataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
