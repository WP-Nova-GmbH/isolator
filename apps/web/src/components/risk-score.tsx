import { Badge } from '@/components/ui/badge';

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/** Band for a likelihood × impact score (each 1–5). 17–19 can't occur on a 5 × 5 matrix. */
export function riskBand(score: number): RiskBand {
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
}

const bands: Record<RiskBand, string> = {
  low: 'bg-risk-low text-risk-low-on',
  medium: 'bg-risk-medium text-risk-medium-on',
  high: 'bg-risk-high text-risk-high-on',
  critical: 'bg-risk-critical text-risk-critical-on',
};

/** Score chip: the number in the band's colour, the band name for screen readers and tooltips. */
export function RiskScore({ likelihood, impact }: { likelihood: number; impact: number }) {
  const score = likelihood * impact;
  const band = riskBand(score);
  return (
    <Badge
      title={`${band} risk: likelihood ${likelihood} × impact ${impact}`}
      className={`h-6 min-w-7 font-mono tabular-nums ${bands[band]}`}
    >
      {score}
      <span className="sr-only"> ({band})</span>
    </Badge>
  );
}
