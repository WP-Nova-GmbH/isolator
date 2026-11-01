import type { ReactNode } from 'react';

export function StatGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3"
    >
      {children}
    </section>
  );
}

export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg bg-surface-sunken px-4.5 py-4">
      <span className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
