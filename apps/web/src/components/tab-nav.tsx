import { Link, useLocation, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';

interface TabNavItem {
  to: string;
  label: string;
  active: boolean;
  /** How many records the tab holds, shown beside its label. */
  count?: number;
}

/**
 * Segmented tabs made of links. Every tab has its own URL: a part of a page is a route
 * (/suppliers/S-03/reviews), a filter of one list is a search param (?tab=closed).
 */
export function TabNav({ label, items }: { label: string; items: TabNavItem[] }) {
  return (
    <nav
      aria-label={label}
      className="flex max-w-full flex-wrap gap-0.5 self-start rounded-[0.625rem] bg-surface-sunken p-0.75"
    >
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[0.4375rem] px-3 py-1.25 font-medium text-muted-foreground transition-colors hover:text-foreground',
            item.active && 'bg-surface text-foreground shadow-xs ring-1 ring-border',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The search for a list filtered to one tab. The list's search, sort and page size stay as
 * they are, and it starts again on its first page.
 */
export function tabSearch(params: URLSearchParams, tab: string | null) {
  const next = new URLSearchParams();
  if (tab !== null) next.set('tab', tab);
  for (const key of ['q', 'sort', 'size']) {
    const value = params.get(key);
    if (value !== null) next.set(key, value);
  }
  return next;
}

/**
 * Reads a list filter from the URL, so a filtered list can be linked to. Give a tab a count
 * when the page knows how many records it holds.
 */
export function useTabFilter(tabs: { value: string; label: string; count?: number }[]) {
  const [params] = useSearchParams();
  const value = params.get('tab') ?? tabs[0].value;
  const items = tabs.map((tab) => ({
    to: `?${tabSearch(params, tab.value)}`,
    label: tab.label,
    active: tab.value === value,
    count: tab.count,
  }));
  return { value, items };
}

const riskTabs = [
  { to: '/risks', label: 'Register' },
  { to: '/risks/assessments', label: 'Risk assessments' },
  { to: '/risks/criteria', label: 'Risk criteria' },
];

export function RiskTabs() {
  const { pathname } = useLocation();
  return (
    <TabNav
      label="Risks"
      items={riskTabs.map((tab) => ({ ...tab, active: tab.to === pathname }))}
    />
  );
}
