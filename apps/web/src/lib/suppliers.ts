import { yesNoFromForm } from '@/components/owner-select';
import type { State } from '@/components/state-badge';
import type { AuditEvent } from '@/lib/audit';
import type { StoredFile } from '@/lib/files';
import type { RiskDecision } from '@/lib/risks';

export type SupplierCriticality = 'low' | 'medium' | 'high';
export type ContractTerm = 'fixed' | 'rolling';
export type SupplierFileKind =
  | 'contract'
  | 'data_processing_agreement'
  | 'certificate'
  | 'security_assessment'
  | 'other';
export type SupplierReviewOutcome = 'no_concerns' | 'concerns' | 'stop_using';

export const criticalityLabels: Record<SupplierCriticality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const contractTermLabels: Record<ContractTerm, string> = {
  fixed: 'Ends on a date',
  rolling: 'Rolls on until notice',
};

/** What the register says about when the contract ends. */
export function contractEndLabel(supplier: Pick<Supplier, 'contractTerm' | 'contractEnds'>) {
  if (supplier.contractTerm === 'fixed') return supplier.contractEnds!;
  return supplier.contractTerm === 'rolling' ? 'Rolling' : 'Unknown';
}

export const fileKindLabels: Record<SupplierFileKind, string> = {
  contract: 'Contract',
  data_processing_agreement: 'Data processing agreement',
  certificate: 'Certificate',
  security_assessment: 'Security assessment',
  other: 'Other',
};

export const reviewOutcomeLabels: Record<SupplierReviewOutcome, State<'supplierReview'>> = {
  no_concerns: 'No concerns',
  concerns: 'Concerns',
  stop_using: 'Stop using',
};

export interface Supplier {
  ref: string;
  name: string;
  provides: string;
  /** Null while unassigned. The facts below are null while nobody knows them. */
  ownerId: string | null;
  ownerName: string | null;
  criticality: SupplierCriticality | null;
  handlesPersonalData: boolean | null;
  contact: string;
  contractTerm: ContractTerm | null;
  /** Set when the contract term is fixed. */
  contractEnds: string | null;
  exitPlan: string;
  nextReviewOn: string;
  endedAt: string | null;
  endedReason: string | null;
  assetCount: number;
  state: State<'supplier'>;
  attention: string[];
}

export interface SupplierFile {
  id: string;
  kind: SupplierFileKind;
  title: string;
  location: string | null;
  upload: StoredFile | null;
  /** Null when the date on the paperwork isn't known. */
  datedOn: string | null;
  expiresOn: string | null;
  state: State<'evidence'>;
}

export interface SupplierReview {
  id: string;
  reviewedOn: string;
  reviewerName: string;
  outcome: SupplierReviewOutcome;
  notes: string;
  nextReviewOn: string;
}

export interface SupplierDetail extends Supplier {
  files: SupplierFile[];
  reviews: SupplierReview[];
  assets: { id: string; name: string }[];
  risks: (RiskDecision & { ref: string; title: string })[];
  history: AuditEvent[];
}

/** The form fields in SupplierFields, as the API takes them. */
export function supplierPayload(form: FormData) {
  return {
    name: form.get('name'),
    provides: form.get('provides'),
    ownerId: form.get('ownerId') || null,
    criticality: form.get('criticality') || null,
    handlesPersonalData: yesNoFromForm(form.get('handlesPersonalData')),
    contact: form.get('contact'),
    contractTerm: form.get('contractTerm') || null,
    contractEnds: form.get('contractEnds') || null,
    exitPlan: form.get('exitPlan'),
    nextReviewOn: form.get('nextReviewOn'),
  };
}
