import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-subtle text-neutral-foreground',
  success: 'bg-success-subtle text-success-foreground',
  warning: 'bg-warning-subtle text-warning-foreground',
  info: 'bg-info-subtle text-info-foreground',
  danger: 'bg-danger-subtle text-danger-foreground',
};

/** Square-cornered status label. The tone carries meaning, so always pair it with text. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
