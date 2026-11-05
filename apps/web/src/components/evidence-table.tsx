import { XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useFetcher } from 'react-router';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import { DownloadButton } from '@/components/download-button';
import { UNKNOWN } from '@/components/owner-select';
import { StateBadge } from '@/components/state-badge';
import { dataCell, mainCell, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
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

const column = columnHelper<EvidenceItem>();

const refColumn = column.accessor('ref', {
  header: 'Ref',
  cell: ({ getValue }) => (
    <Link to={`/soa/${getValue()}`} className="hover:underline">
      <Ref>{getValue()}</Ref>
    </Link>
  ),
});

const titleColumn = column.accessor('title', {
  header: 'Evidence',
  meta: { className: mainCell },
  cell: ({ row }) => <EvidenceTitle item={row.original} />,
});

const detailColumns = column.columns([
  column.accessor('kind', { header: 'Kind' }),
  column.accessor((item) => item.datedOn ?? undefined, {
    id: 'dated',
    header: 'Dated',
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? UNKNOWN,
  }),
  column.accessor((item) => item.expiresOn ?? undefined, {
    id: 'expires',
    header: 'Expires',
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? 'None',
  }),
]);

const addedByColumn = column.accessor('addedBy', { header: 'Added by' });

const stateColumn = column.accessor('state', {
  header: 'State',
  sortFn: sortByOrder(['Expired', 'Expires soon', 'Current'], (item) => item.state),
  cell: ({ getValue }) => <StateBadge kind="evidence" state={getValue()} />,
});

const actionsColumn = column.display({
  id: 'actions',
  header: () => <span className="sr-only">Actions</span>,
  meta: { className: 'py-0' },
  cell: ({ row }) => <RemoveEvidence item={row.original} />,
});

interface EvidenceTableProps {
  items: EvidenceItem[];
  /** Shows which control each belongs to, on the page that lists all of them. */
  showControl?: boolean;
}

/** Posts intent=remove-evidence to the page's action. */
export function EvidenceTable({ items, showControl = false }: EvidenceTableProps) {
  const { canEdit } = usePermissions();
  const columns = useMemo(
    () => [
      ...(showControl ? [refColumn] : []),
      titleColumn,
      ...detailColumns,
      ...(showControl ? [addedByColumn] : []),
      stateColumn,
      ...(canEdit ? [actionsColumn] : []),
    ],
    [showControl, canEdit],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(item) => item.id}
      // On an SoA entry the Evidence shares the URL with the entry's Tasks.
      paramPrefix={showControl ? undefined : 'evidence-'}
      searchLabel={showControl ? 'Search Evidence' : undefined}
      emptyText="No Evidence yet."
    />
  );
}
