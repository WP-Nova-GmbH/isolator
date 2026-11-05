import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A record's facts, read-only. Laid out like FieldGrid, so the Edit dialog looks familiar. */
export function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(13.75rem,100%),1fr))] gap-x-4 gap-y-5">
      {children}
    </dl>
  );
}

interface FactProps {
  label: string;
  /** Empty strings, null and undefined show `empty` instead. */
  children?: ReactNode;
  /** Shown when there is no value: "Unknown", "Unassigned", "None". */
  empty?: string;
  /** Takes the whole row and keeps line breaks, for notes and descriptions. */
  wide?: boolean;
}

export function Fact({ label, children, empty = 'Not set', wide = false }: FactProps) {
  const missing = children === null || children === undefined || children === '';

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', wide && 'col-span-full')}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('break-words', wide && 'whitespace-pre-line', missing && 'text-muted-foreground')}>
        {missing ? empty : children}
      </dd>
    </div>
  );
}
