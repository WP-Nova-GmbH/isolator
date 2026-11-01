import { Link, useLoaderData } from 'react-router';
import { PageHeader } from '@/components/page-header';
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
import { assetTypeLabels, classificationLabels, type Asset } from '@/lib/assets';
import { useAppData } from '@/lib/members';

export async function assetsLoader() {
  const [assets, retired] = await Promise.all([
    api<Asset[]>('/assets'),
    api<Asset[]>('/assets?state=retired'),
  ]);
  return { assets, retired };
}

export function Assets() {
  const { assets, retired } = useLoaderData<typeof assetsLoader>();
  const { me } = useAppData();

  return (
    <>
      <PageHeader
        title="Assets"
        description={`What ${me.organizationName} needs to protect, who owns it, and which Supplier provides it.`}
        actions={
          <Button asChild>
            <Link to="/assets/new">Add asset</Link>
          </Button>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Open risks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <MainCell>
                <RecordLink to={`/assets/${asset.id}`}>{asset.name}</RecordLink>
              </MainCell>
              <TableCell>{assetTypeLabels[asset.type]}</TableCell>
              <TableCell>{classificationLabels[asset.classification]}</TableCell>
              <TableCell>{asset.ownerName}</TableCell>
              {asset.supplier ? (
                <TableCell>
                  <RecordLink to={`/suppliers/${asset.supplier.ref}`} className="font-normal">
                    {asset.supplier.name}
                  </RecordLink>
                </TableCell>
              ) : (
                <DataCell>None</DataCell>
              )}
              <DataCell>{asset.risks}</DataCell>
            </TableRow>
          ))}
          {assets.length === 0 && (
            <EmptyRow colSpan={6}>No assets yet. Add the first one.</EmptyRow>
          )}
        </TableBody>
      </Table>

      {retired.length > 0 && (
        <section aria-label="Retired assets" className="flex flex-col gap-3">
          <h2>Retired assets</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Retired</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {retired.map((asset) => (
                <TableRow key={asset.id}>
                  <MainCell>
                    <RecordLink to={`/assets/${asset.id}`}>{asset.name}</RecordLink>
                  </MainCell>
                  <TableCell>{asset.ownerName}</TableCell>
                  <DataCell>{asset.retiredAt?.slice(0, 10)}</DataCell>
                  <DataCell className="min-w-40 whitespace-normal">{asset.retiredReason}</DataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
