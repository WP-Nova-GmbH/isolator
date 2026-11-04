import type { State } from '@/components/state-badge';
import type { AuditEvent } from '@/lib/audit';
import type { StoredFile } from '@/lib/files';

export type DocumentKind =
  | 'scope'
  | 'policy'
  | 'interested_parties'
  | 'roles'
  | 'objectives'
  | 'legal_requirements'
  | 'competence'
  | 'awareness'
  | 'internal_audit'
  | 'management_review'
  | 'procedure'
  | 'risk_methodology'
  | 'assessment'
  | 'inventory'
  | 'reference'
  | 'other';

export const documentKindLabels: Record<DocumentKind, string> = {
  scope: 'Scope',
  policy: 'Policy',
  interested_parties: 'Interested parties',
  roles: 'Roles and responsibilities',
  objectives: 'Objectives',
  legal_requirements: 'Legal requirements',
  competence: 'Competence',
  awareness: 'Awareness',
  internal_audit: 'Internal audit',
  management_review: 'Management review',
  procedure: 'Procedure',
  risk_methodology: 'Risk methodology',
  assessment: 'Assessment',
  inventory: 'Inventory',
  reference: 'Reference material',
  other: 'Other',
};

/** The kinds in the groups a picker shows them in. */
export const documentKindGroups: { label: string; kinds: DocumentKind[] }[] = [
  {
    label: 'ISMS',
    kinds: [
      'scope',
      'interested_parties',
      'legal_requirements',
      'roles',
      'objectives',
      'risk_methodology',
      'competence',
      'awareness',
      'internal_audit',
      'management_review',
    ],
  },
  { label: 'Rules', kinds: ['policy', 'procedure'] },
  { label: 'Records and material', kinds: ['assessment', 'inventory', 'reference', 'other'] },
];

export interface IsmsDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  ownerId: string;
  ownerName: string;
  version: number;
  versionInForce: number | null;
  /** The date the latest version itself carries. Null when nobody knows it. */
  datedOn: string | null;
  lastConfirmedAt: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
  state: State<'document'>;
}

export interface DocumentVersion {
  version: number;
  datedOn: string | null;
  createdBy: string;
  createdAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  upload: StoredFile | null;
}

export interface DocumentDetail extends IsmsDocument {
  content: string;
  upload: StoredFile | null;
  versions: DocumentVersion[];
  usedAsEvidence: { ref: string; title: string }[];
  deletable: boolean;
  history: AuditEvent[];
}

/** The form fields in DocumentFields, as the API takes them. */
export function documentPayload(form: FormData) {
  return {
    title: form.get('title'),
    kind: form.get('kind'),
    ownerId: form.get('ownerId'),
    content: form.get('content'),
    datedOn: form.get('datedOn') || null,
  };
}
