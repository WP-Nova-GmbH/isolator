import { Link, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { ImportButton } from '@/components/import-dialog';
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Business owner</TableHead>
            <TableHead>Suppliers</TableHead>
            <TableHead>Open risks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <MainCell>
                <RecordLink to={`/assets/${asset.id}`}>{asset.name}</RecordLink>
                <AssetNote asset={asset} />
              </MainCell>
              <TableCell>{assetTypeLabels[asset.type]}</TableCell>
              {asset.classification ? (
                <TableCell>{classificationLabels[asset.classification]}</TableCell>
              ) : (
                <DataCell>{UNKNOWN}</DataCell>
              )}
              {asset.ownerName ? (
                <TableCell>{asset.ownerName}</TableCell>
              ) : (
                <DataCell>{UNASSIGNED}</DataCell>
              )}
              {asset.suppliers.length > 0 ? (
                <TableCell>
                  {asset.suppliers.map((supplier, index) => (
                    <span key={supplier.ref}>
                      {index > 0 && ', '}
                      <RecordLink to={`/suppliers/${supplier.ref}`} className="font-normal">
                        {supplier.name}
                      </RecordLink>
                    </span>
                  ))}
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
                  <TableCell>{asset.ownerName ?? UNASSIGNED}</TableCell>
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
