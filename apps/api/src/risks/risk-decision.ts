export type RiskTreatment = 'mitigate' | 'accept' | 'transfer' | 'avoid';

/** What a Confirmation decides: the risk's rating and its treatment. */
export interface RiskDecision {
  likelihood: number;
  impact: number;
  residualLikelihood: number | null;
  residualImpact: number | null;
  treatment: RiskTreatment | null;
}

/** One risk as a completed Risk assessment preserves it. */
export interface RegisterEntry extends RiskDecision {
  ref: string;
  title: string;
  ownerName: string;
  reviewOn: string;
  confirmedBy: string;
  confirmedOn: string;
}

export function decisionOf(risk: RiskDecision): RiskDecision {
  return {
    likelihood: risk.likelihood,
    impact: risk.impact,
    residualLikelihood: risk.residualLikelihood,
    residualImpact: risk.residualImpact,
    treatment: risk.treatment,
  };
}

export function sameDecision(a: RiskDecision, b: RiskDecision) {
  return (
    a.likelihood === b.likelihood &&
    a.impact === b.impact &&
    a.residualLikelihood === b.residualLikelihood &&
    a.residualImpact === b.residualImpact &&
    a.treatment === b.treatment
  );
}

export function formatRiskRef(number: number) {
  return `R-${String(number).padStart(2, '0')}`;
}

export function parseRiskRef(ref: string) {
  const match = /^R-(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/** Why this decision can't be confirmed yet, or null when it can. */
export function confirmationBlocker(decision: RiskDecision, acceptanceThreshold: number) {
  const rated = decision.residualLikelihood !== null && decision.residualImpact !== null;
  if (decision.treatment && !rated) {
    return 'Rate the risk after treatment before confirming.';
  }
  if (decision.likelihood * decision.impact > acceptanceThreshold && !decision.treatment) {
    return `This risk is above your acceptance threshold of ${acceptanceThreshold}. Choose a treatment before confirming.`;
  }
  return null;
}
