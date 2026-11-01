import type { ReactNode } from 'react';

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/** Band for a likelihood × impact score (each 1–5). 17–19 can't occur on a 5 × 5 matrix. */
export function riskBand(score: number): RiskBand {
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
}

/** Tinted fill: score chips and empty matrix cells. */
export const riskTint: Record<RiskBand, string> = {
  low: 'bg-success-subtle text-success-foreground',
  medium: 'bg-warning-subtle text-warning-foreground',
  high: 'bg-risk-high-subtle text-risk-high-foreground',
  critical: 'bg-danger-subtle text-danger-foreground',
};

/** Solid fill: matrix cells that hold risks. */
export const riskSolid: Record<RiskBand, string> = {
  low: 'bg-risk-low text-risk-low-on',
  medium: 'bg-risk-medium text-risk-medium-on',
  high: 'bg-risk-high text-risk-high-on',
  critical: 'bg-risk-critical text-risk-critical-on',
};

export function RiskChip({
  band,
  title,
  children,
}: {
  band: RiskBand;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-5.5 min-w-7.5 items-center justify-center rounded-sm px-1.75 text-xs font-semibold tabular-nums ${riskTint[band]}`}
    >
      {children}
    </span>
  );
}

/** Score chip: the number in the band's colour, the band name for screen readers and tooltips. */
export function RiskScore({ likelihood, impact }: { likelihood: number; impact: number }) {
  const score = likelihood * impact;
  const band = riskBand(score);
  return (
    <RiskChip band={band} title={`${band} risk: likelihood ${likelihood} × impact ${impact}`}>
      {score}
      <span className="sr-only"> ({band})</span>
    </RiskChip>
  );
}
