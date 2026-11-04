import { XIcon } from 'lucide-react';
import { Link, useFetcher } from 'react-router';
import { DownloadButton } from '@/components/download-button';
import { UNKNOWN } from '@/components/owner-select';
import { StateBadge } from '@/components/state-badge';
import { DataCell, EmptyRow, MainCell, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/lib/members';
import type { EvidenceItem } from '@/lib/soa';

function RemoveEvidence({ item }: { item: EvidenceItem }) {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={item.id} />
      <Button
        type="submit"
        name="intent"
        value="remove-evidence"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${item.title}`}
      >
        <XIcon />
      </Button>
    </fetcher.Form>
  );
}

function EvidenceTitle({ item }: { item: EvidenceItem }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      {item.document ? (
        <Link to={`/documents/${item.document.id}`} className="font-medium hover:underline">
          {item.title}
        </Link>
      ) : (
        <span className="font-medium">{item.title}</span>
      )}
      {item.upload && <DownloadButton file={item.upload} />}
      {item.location && (
        <span className="text-xs text-muted-foreground">{item.location}</span>
      )}
    </div>
  );
}

interface EvidenceTableProps {
  items: EvidenceItem[];
  /** Shows which control each belongs to, on the page that lists all of them. */
  showControl?: boolean;
}

/** Posts intent=remove-evidence to the page's action. */
export function EvidenceTable({ items, showControl = false }: EvidenceTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showControl && <TableHead>Ref</TableHead>}
          <TableHead>Evidence</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Dated</TableHead>
          <TableHead>Expires</TableHead>
          {showControl && <TableHead>Added by</TableHead>}
          <TableHead>State</TableHead>
          <TableHead className="sr-only">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            {showControl && (
              <TableCell>
                <Link to={`/soa/${item.ref}`} className="hover:underline">
                  <Ref>{item.ref}</Ref>
                </Link>
              </TableCell>
            )}
            <MainCell>
              <EvidenceTitle item={item} />
            </MainCell>
            <TableCell>{item.kind}</TableCell>
            <DataCell>{item.datedOn ?? UNKNOWN}</DataCell>
            <DataCell>{item.expiresOn ?? 'None'}</DataCell>
            {showControl && <TableCell>{item.addedBy}</TableCell>}
            <TableCell>
              <StateBadge kind="evidence" state={item.state} />
            </TableCell>
            <TableCell className="py-0">
              <RemoveEvidence item={item} />
            </TableCell>
          </TableRow>
        ))}
        {items.length === 0 && (
          <EmptyRow colSpan={(showControl ? 7 : 5) + (canEdit ? 1 : 0)}>No Evidence yet.</EmptyRow>
        )}
      </TableBody>
    </Table>
  );
}
