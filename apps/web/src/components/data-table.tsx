import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  FlexRender,
  functionalUpdate,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Header,
  type PaginationState,
  type RowData,
  type SortFn,
  type SortingState,
} from '@tanstack/react-table';
import { EmptyRow } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PAGE_SIZES, useTableParams } from '@/lib/table-params';
import { cn } from '@/lib/utils';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  /** `className` is set on the column's cells, such as `mainCell` or `dataCell`. */
  columnMeta: metaHelper<{ className?: string }>(),
});

type Features = typeof features;

// Outside the component: the table recomputes its columns when these change.
const defaultColumn = { sortUndefined: 'last' } as const;
/** Every column with a value takes part in the search, also when the first row has none. */
const everyColumn = () => true;

/** Each column keeps its own value type. */
export type DataTableColumn<TData extends RowData> = ColumnDef<Features, TData, any>;

/** Builds a register's columns: `const column = columnHelper<Asset>()`. */
export function columnHelper<TData extends RowData>() {
  return createColumnHelper<Features, TData>();
}

/**
 * Sorts by a fixed order, so Low, Medium, High sort as a scale and not alphabetically. A label
 * record's keys are such an order: `sortByOrder(Object.keys(criticalityLabels), …)`. Rows
 * without a value sort last, as everywhere.
 */
export function sortByOrder<TData extends RowData>(
  order: readonly string[],
  value: (row: TData) => string | null,
): SortFn<Features, TData> {
  return (a, b) => order.indexOf(value(a.original) ?? '') - order.indexOf(value(b.original) ?? '');
}

function columnId<TData extends RowData>(column: DataTableColumn<TData>) {
  return column.id ?? ('accessorKey' in column ? String(column.accessorKey) : undefined);
}

/**
 * The search box keeps what is typed and writes it to the URL, after `delay` ms of quiet when
 * each search asks the server. When the URL changes for another reason, such as Back, the box
 * shows the URL's search again.
 */
function useSearchText(q: string, write: (text: string) => void, delay: number) {
  const [text, setText] = useState(q);
  const written = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const index = written.current.indexOf(q);
    if (index >= 0) {
      written.current = written.current.slice(index + 1);
      return;
    }
    written.current = [];
    setText(q);
  }, [q]);

  function change(value: string) {
    setText(value);
    const send = () => {
      written.current.push(value);
      write(value);
    };
    clearTimeout(timer.current);
    if (delay > 0) timer.current = setTimeout(send, delay);
    else send();
  }

  return [text, change] as const;
}

interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  /** Shown when the list holds no records at all. */
  emptyText: string;
  /** Labels the search box, such as "Search assets". Leave it out where a list needs none. */
  searchLabel?: string;
  /** Controls beside the search that filter the list, such as its TabNav. */
  filters?: ReactNode;
  /** Prefixes the URL params when two tables share a page, such as `tasks-`. */
  paramPrefix?: string;
  /**
   * Set when the server pages and searches the list, as for the Audit trail: `data` is then
   * the current page, and this is how many records match on every page. The route's loader
   * reads `q`, `page` and `size` from the URL, and the list keeps the server's order.
   */
  rowCount?: number;
}

/**
 * A register: sortable columns, a search box and pages. What the reader sees is kept in the
 * URL, so a sorted or searched list can be linked to and comes back with Back.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  emptyText,
  searchLabel,
  filters,
  paramPrefix,
  rowCount,
}: DataTableProps<TData>) {
  const onServer = rowCount !== undefined;
  const [params, update] = useTableParams(paramPrefix);
  const [search, setSearch] = useSearchText(
    params.q,
    (q) => update({ q }, { replace: true }),
    onServer ? 300 : 0,
  );
  const query = search.trim();

  const ids = columns.map(columnId).join(' ');
  const sorting = useMemo<SortingState>(
    () => (params.sort && ids.split(' ').includes(params.sort.id) ? [params.sort] : []),
    [params.sort, ids],
  );
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: params.pageIndex, pageSize: params.pageSize }),
    [params.pageIndex, params.pageSize],
  );

  const table = useTable({
    features,
    columns,
    data,
    getRowId,
    state: { sorting, pagination, globalFilter: query },
    onSortingChange: (updater) => update({ sort: functionalUpdate(updater, sorting)[0] ?? null }),
    onPaginationChange: (updater) => update(functionalUpdate(updater, pagination)),
    defaultColumn,
    enableMultiSort: false,
    globalFilterFn: 'includesString',
    getColumnCanGlobalFilter: everyColumn,
    // The page is in the URL and only changes when the reader changes it.
    autoResetPageIndex: false,
    manualPagination: onServer,
    manualFiltering: onServer,
    enableSorting: !onServer,
    rowCount,
  });

  const rows = table.getRowModel().rows;
  const total = rowCount ?? table.getPrePaginatedRowModel().rows.length;
  const pageCount = table.getPageCount();
  const typing = search !== params.q;

  // A page that no longer exists, such as after the last record on it was removed.
  useEffect(() => {
    if (!typing && params.pageIndex > 0 && params.pageIndex >= pageCount) {
      update({ pageIndex: Math.max(pageCount - 1, 0) }, { replace: true });
    }
  });

  const anyRecords = onServer ? total > 0 || query !== '' : data.length > 0;
  let emptyRow = emptyText;
  if (anyRecords) emptyRow = query ? `Nothing matches “${query}”.` : 'Nothing on this page.';
  const paged =
    (onServer ? total : data.length) > PAGE_SIZES[0] ||
    params.pageIndex > 0 ||
    params.pageSize !== PAGE_SIZES[0];

  return (
    <div className="flex flex-col gap-3">
      {(filters || searchLabel) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          {searchLabel && (
            <SearchBox label={searchLabel} value={search} onChange={setSearch} />
          )}
        </div>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <SortableHead key={header.id} header={header} />
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={columns.length}>{emptyRow}</EmptyRow>}
        </TableBody>
      </Table>
      {paged && (
        <Pagination
          pageIndex={params.pageIndex}
          pageSize={params.pageSize}
          pageCount={pageCount}
          total={total}
          setPageIndex={(index) => table.setPageIndex(index)}
          setPageSize={(size) => table.setPageSize(size)}
        />
      )}
    </div>
  );
}

function SearchBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="search" className="relative w-full sm:ml-auto sm:w-64">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-8"
      />
    </div>
  );
}

const ariaSort = { asc: 'ascending', desc: 'descending' } as const;

function SortableHead<TData extends RowData>({ header }: { header: Header<Features, TData> }) {
  const { column } = header;
  const sorted = column.getIsSorted();
  if (header.isPlaceholder) return <TableHead />;
  if (!column.getCanSort()) {
    return (
      <TableHead>
        <FlexRender header={header} />
      </TableHead>
    );
  }

  const Icon = sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <TableHead aria-sort={sorted ? ariaSort[sorted] : undefined}>
      <button
        type="button"
        onClick={column.getToggleSortingHandler()}
        className={cn(
          'group -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          sorted && 'text-foreground',
        )}
      >
        <FlexRender header={header} />
        <Icon
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0',
            !sorted && 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        />
      </button>
    </TableHead>
  );
}

interface PaginationProps {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  /** Records in the list after the search, on every page. */
  total: number;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
}

function Pagination({
  pageIndex,
  pageSize,
  pageCount,
  total,
  setPageIndex,
  setPageSize,
}: PaginationProps) {
  const sizeId = useId();
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  const lastPage = Math.max(pageCount - 1, 0);

  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground"
    >
      <p className="tabular-nums">
        {first}–{last} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={sizeId}>Rows per page</label>
          <div className="w-18">
            <NativeSelect
              id={sizeId}
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 md:text-xs"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <span className="tabular-nums">
          Page {Math.min(pageIndex, lastPage) + 1} of {lastPage + 1}
        </span>
        <div className="flex items-center gap-1">
          <PageButton
            label="First page"
            icon={ChevronsLeftIcon}
            disabled={pageIndex === 0}
            onClick={() => setPageIndex(0)}
          />
          <PageButton
            label="Previous page"
            icon={ChevronLeftIcon}
            disabled={pageIndex === 0}
            onClick={() => setPageIndex(pageIndex - 1)}
          />
          <PageButton
            label="Next page"
            icon={ChevronRightIcon}
            disabled={pageIndex >= lastPage}
            onClick={() => setPageIndex(pageIndex + 1)}
          />
          <PageButton
            label="Last page"
            icon={ChevronsRightIcon}
            disabled={pageIndex >= lastPage}
            onClick={() => setPageIndex(lastPage)}
          />
        </div>
      </div>
    </nav>
  );
}

function PageButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}
