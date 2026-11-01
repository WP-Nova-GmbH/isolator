import { describe, expect, it } from 'vitest';
import { confirmationBlocker, formatRiskRef, parseRiskRef, type RiskDecision } from './risk-decision';

const decision: RiskDecision = {
  likelihood: 3,
  impact: 4,
  residualLikelihood: 2,
  residualImpact: 3,
  treatment: 'mitigate',
};

describe('risk refs', () => {
  it('pads to two digits and keeps larger numbers whole', () => {
    expect(formatRiskRef(3)).toBe('R-03');
    expect(formatRiskRef(120)).toBe('R-120');
  });

  it('reads back what it wrote and refuses anything else', () => {
    expect(parseRiskRef('R-03')).toBe(3);
    expect(parseRiskRef('R-120')).toBe(120);
    expect(parseRiskRef('new')).toBeNull();
    expect(parseRiskRef('R-1; drop')).toBeNull();
  });
});

describe('confirmationBlocker', () => {
  it('allows a treated, rated risk', () => {
    expect(confirmationBlocker(decision, 8)).toBeNull();
  });

  it('allows a risk within the threshold to go without treatment', () => {
    const low = { ...decision, residualLikelihood: null, residualImpact: null, treatment: null };
    expect(confirmationBlocker({ ...low, likelihood: 2, impact: 4 }, 8)).toBeNull();
  });

  it('requires a treatment above the threshold', () => {
    const high = { ...decision, residualLikelihood: null, residualImpact: null, treatment: null };
    expect(confirmationBlocker(high, 8)).toContain('Choose a treatment');
  });

  it('requires a rating after treatment once there is a treatment', () => {
    const unrated = { ...decision, residualLikelihood: null, residualImpact: null };
    expect(confirmationBlocker(unrated, 25)).toContain('Rate the risk after treatment');
  });
});
