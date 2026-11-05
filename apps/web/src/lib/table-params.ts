import { useMemo } from 'react';
import { useSearchParams, type ShouldRevalidateFunction } from 'react-router';

export const PAGE_SIZES = [25, 50, 100] as const;

/** Search, sort, page and page size of a list, kept in the URL so a list can be linked to. */
const TABLE_PARAM = /^(?:[a-z]+-)?(?:q|sort|page|size)$/;

function withoutTableParams(url: URL) {
  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) if (TABLE_PARAM.test(key)) params.delete(key);
  params.sort();
  return params.toString();
}

/**
 * Searching, sorting or paging a list only changes what the reader sees, so it never
 * reloads data. Any other change to the URL, a form or a revalidation does as usual.
 */
export const keepDataOnTableParams: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  const onlyTableParams =
    !formMethod &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search !== nextUrl.search &&
    withoutTableParams(currentUrl) === withoutTableParams(nextUrl);
  return onlyTableParams ? false : defaultShouldRevalidate;
};

/**
 * For a list the server pages and searches, such as the Audit trail: its loader reads the
 * search and page, so changing them loads the list again.
 */
export const loadOnTableParams: ShouldRevalidateFunction = ({ defaultShouldRevalidate }) =>
  defaultShouldRevalidate;

export interface TableParams {
  q: string;
  /** The column the list is sorted by, if the reader picked one. */
  sort: { id: string; desc: boolean } | null;
  /** Zero-based. */
  pageIndex: number;
  pageSize: number;
}

/** A list's search, sort and page as the URL has them, for a component or a loader. */
export function readTableParams(params: URLSearchParams, prefix = ''): TableParams {
  const sort = params.get(`${prefix}sort`);
  const page = Number(params.get(`${prefix}page`));
  const size = Number(params.get(`${prefix}size`));
  return {
    q: params.get(`${prefix}q`) ?? '',
    sort: sort ? { id: sort.replace(/^-/, ''), desc: sort.startsWith('-') } : null,
    pageIndex: Number.isInteger(page) && page > 1 ? page - 1 : 0,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0],
  };
}

/**
 * Reads and writes a list's search, sort and page from the URL: `?q=`, `?sort=name` or
 * `?sort=-name`, `?page=2`, `?size=50`. Give a prefix when two lists share a page.
 */
export function useTableParams(prefix = '') {
  const [params, setParams] = useSearchParams();
  const key = (name: string) => `${prefix}${name}`;
  const read = readTableParams(params, prefix);
  const sortKey = read.sort && `${read.sort.desc ? '-' : ''}${read.sort.id}`;
  // The same object while the URL says the same, so the table doesn't sort again.
  const state = useMemo(() => read, [read.q, sortKey, read.pageIndex, read.pageSize]);

  /** Sets or removes params. A new search or sort starts again on the first page. */
  function update(
    changes: { q?: string; sort?: TableParams['sort']; pageIndex?: number; pageSize?: number },
    { replace = false } = {},
  ) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const set = (name: string, value: string | null) =>
          value === null ? next.delete(key(name)) : next.set(key(name), value);
        if (changes.q !== undefined) set('q', changes.q || null);
        if (changes.sort !== undefined) {
          set('sort', changes.sort && `${changes.sort.desc ? '-' : ''}${changes.sort.id}`);
        }
        if (changes.pageSize !== undefined) {
          set('size', changes.pageSize === PAGE_SIZES[0] ? null : String(changes.pageSize));
        }
        const pageIndex =
          changes.pageIndex ??
          (changes.q !== undefined || changes.sort !== undefined || changes.pageSize !== undefined
            ? 0
            : undefined);
        if (pageIndex !== undefined) set('page', pageIndex > 0 ? String(pageIndex + 1) : null);
        return next;
      },
      { replace, preventScrollReset: true },
    );
  }

  return [state, update] as const;
}
