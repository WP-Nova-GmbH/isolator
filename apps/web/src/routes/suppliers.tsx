import { Link, useLoaderData } from 'react-router';
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
import { useAppData } from '@/lib/members';
import { criticalityLabels, type Supplier } from '@/lib/suppliers';

export async function suppliersLoader() {
  const [suppliers, ended] = await Promise.all([
    api<Supplier[]>('/suppliers'),
    api<Supplier[]>('/suppliers?state=ended'),
  ]);
  return { suppliers, ended };
}

export function Suppliers() {
  const { suppliers, ended } = useLoaderData<typeof suppliersLoader>();
  const { me } = useAppData();
  const needsAttention = suppliers.filter((supplier) => supplier.attention.length > 0);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`Outside companies ${me.organizationName} relies on, and the assets each one provides.`}
        actions={
          <Button asChild>
            <Link to="/suppliers/new">Add Supplier</Link>
          </Button>
        }
      />

      <section aria-label="Needs attention" className="flex flex-col gap-3">
        <h2>Needs attention</h2>
        <Table>
          <TableBody>
            {needsAttention.map((supplier) => (
              <TableRow key={supplier.ref}>
                <TableCell>
                  <RecordLink to={`/suppliers/${supplier.ref}`}>{supplier.name}</RecordLink>
                </TableCell>
                <DataCell className="min-w-60 whitespace-normal">
                  {supplier.attention.join(' ')}
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
                    <div className="text-xs text-muted-foreground">{supplier.provides}</div>
                  )}
                </MainCell>
                <TableCell>{criticalityLabels[supplier.criticality]}</TableCell>
                <DataCell>{supplier.assetCount}</DataCell>
                <DataCell>{supplier.contractEnds ?? 'Rolling'}</DataCell>
                <DataCell>{supplier.nextReviewOn}</DataCell>
                <TableCell>{supplier.ownerName}</TableCell>
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
