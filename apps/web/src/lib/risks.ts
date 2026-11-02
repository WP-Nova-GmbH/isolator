import type { State } from '@/components/state-badge';
import type { AuditEvent } from '@/lib/audit';
import type { Task } from '@/lib/tasks';

export type RiskTreatment = 'mitigate' | 'accept' | 'transfer' | 'avoid';

export const treatmentLabels: Record<RiskTreatment, string> = {
  mitigate: 'Mitigate',
  accept: 'Accept',
  transfer: 'Transfer',
  avoid: 'Avoid',
};

export interface RiskDecision {
  likelihood: number;
  impact: number;
  residualLikelihood: number | null;
  residualImpact: number | null;
  treatment: RiskTreatment | null;
}

export interface Risk extends RiskDecision {
  ref: string;
  title: string;
  ownerId: string;
  ownerName: string;
  reviewOn: string;
  closedAt: string | null;
  closedReason: string | null;
  confirmation: { by: string; at: string } | null;
}

export interface RiskDetail extends Risk {
  description: string;
  everConfirmed: boolean;
  assets: { id: string; name: string }[];
  controls: { id: string; ref: string; title: string }[];
  history: AuditEvent[];
}

export interface RiskCriteria {
  acceptanceThreshold: number;
  likelihoodLevels: string[];
  impactLevels: string[];
  saved: boolean;
}

export interface RiskAssessmentRow {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  risks: number;
  aboveThreshold: number;
  completedBy: string | null;
}

export interface RiskAssessmentList {
  assessments: RiskAssessmentRow[];
  nextDue: string | null;
}

export interface RegisterEntry extends RiskDecision {
  ref: string;
  title: string;
  ownerName: string;
  reviewOn: string;
  confirmedBy: string;
  confirmedOn: string;
}

export interface CompletedRiskAssessment {
  title: string;
  completedOn: string;
  completedBy: string;
  acceptanceThreshold: number;
  register: RegisterEntry[];
}

export interface ApiTask {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  dueOn: string;
  state: State<'task'>;
  cancelledReason: string | null;
  belongsTo: {
    kind: 'risk' | 'soa' | 'supplier' | 'incident' | 'nonconformity';
    ref: string;
    title: string;
  } | null;
}

const taskPaths = {
  risk: 'risks',
  soa: 'soa',
  supplier: 'suppliers',
  incident: 'incidents',
  nonconformity: 'nonconformities',
};

export function toTask(task: ApiTask): Task {
  const { belongsTo } = task;
  return {
    id: task.id,
    title: task.title,
    owner: task.ownerName,
    due: task.dueOn,
    state: task.state,
    cancelledReason: task.cancelledReason,
    belongsTo: belongsTo && {
      ref: belongsTo.ref,
      label: belongsTo.title,
      to: `/${taskPaths[belongsTo.kind]}/${belongsTo.ref}`,
    },
  };
}

/** The rating that stands today: after treatment if rated, otherwise before. */
export function currentScore(risk: RiskDecision) {
  return {
    likelihood: risk.residualLikelihood ?? risk.likelihood,
    impact: risk.residualImpact ?? risk.impact,
  };
}

/** The rating after treatment, if there is one. */
export function residualScore(risk: RiskDecision) {
  if (risk.residualLikelihood === null || risk.residualImpact === null) return null;
  return { likelihood: risk.residualLikelihood, impact: risk.residualImpact };
}

/** The form fields in RiskFields, as the API takes them. */
export function riskPayload(form: FormData) {
  const level = (name: string) => {
    const value = form.get(name);
    return value ? Number(value) : null;
  };
  return {
    title: form.get('title'),
    description: form.get('description'),
    ownerId: form.get('ownerId'),
    likelihood: level('likelihood'),
    impact: level('impact'),
    residualLikelihood: level('residualLikelihood'),
    residualImpact: level('residualImpact'),
    treatment: form.get('treatment') || null,
    reviewOn: form.get('reviewOn'),
  };
}
