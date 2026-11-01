import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { riskBand, riskSolid, riskTint } from '@/components/risk-score';

const levels = [1, 2, 3, 4, 5];
const axis = 'text-xs font-medium text-muted-foreground';

/** The fixed 5 × 5 matrix, likelihood up and impact across. Solid cells hold risks. */
export function RiskMatrix({ scores }: { scores: { likelihood: number; impact: number }[] }) {
  return (
    <div
      role="img"
      aria-label="Five by five matrix of likelihood against impact with the number of risks in each cell"
      className="grid w-fit grid-cols-[1.25rem_repeat(5,2.75rem)] items-center justify-items-center gap-1"
    >
      {levels.toReversed().map((likelihood) => (
        <Fragment key={likelihood}>
          <span className={axis}>{likelihood}</span>
          {levels.map((impact) => {
            const score = likelihood * impact;
            const band = riskBand(score);
            const count = scores.filter(
              (s) => s.likelihood === likelihood && s.impact === impact,
            ).length;
            return (
              <span
                key={impact}
                className={cn(
                  'flex h-10 w-11 flex-col items-center justify-center rounded-sm text-xs/3.5 font-medium tabular-nums',
                  count > 0 ? riskSolid[band] : riskTint[band],
                )}
              >
                <span>{score}</span>
                {count > 0 && <span>×{count}</span>}
              </span>
            );
          })}
        </Fragment>
      ))}
      <span />
      {levels.map((impact) => (
        <span key={impact} className={axis}>
          {impact}
        </span>
      ))}
    </div>
  );
}
