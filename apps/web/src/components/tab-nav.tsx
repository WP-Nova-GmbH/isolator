import { Link, useLocation, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';

interface TabNavItem {
  to: string;
  label: string;
  active: boolean;
}

/** Segmented tabs made of links: each tab is a route or a filter in the URL. */
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
            'rounded-[0.4375rem] px-3 py-1.25 font-medium text-muted-foreground transition-colors hover:text-foreground',
            item.active && 'bg-surface text-foreground shadow-xs ring-1 ring-border',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Reads a list filter from the URL, so a filtered list can be linked to. */
export function useTabFilter(tabs: { value: string; label: string }[]) {
  const [params] = useSearchParams();
  const value = params.get('tab') ?? tabs[0].value;
  const items = tabs.map((tab) => ({
    to: `?tab=${tab.value}`,
    label: tab.label,
    active: tab.value === value,
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
