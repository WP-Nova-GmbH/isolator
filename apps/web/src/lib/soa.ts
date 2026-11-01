import type { State } from '@/components/state-badge';
import { api } from '@/lib/api';
import type { AuditEvent } from '@/lib/audit';
import { withUpload, type StoredFile } from '@/lib/files';
import type { RiskDecision } from '@/lib/risks';

export type ImplementationStatus = 'not_started' | 'planned' | 'partial' | 'implemented';

export const statusLabels: Record<ImplementationStatus, State<'control'>> = {
  not_started: 'Not started',
  planned: 'Planned',
  partial: 'Partial',
  implemented: 'Implemented',
};

export interface SoaEntry {
  ref: string;
  title: string;
  theme: 'organizational' | 'people' | 'physical' | 'technological' | 'own';
  own: boolean;
  applicable: boolean;
  status: ImplementationStatus;
  justification: string;
  ownerId: string | null;
  ownerName: string | null;
  everConfirmed: boolean;
  confirmation: { by: string; at: string } | null;
  evidenceCount: number;
  expiredEvidence: number;
}

export interface SoaEntryDetail extends Omit<SoaEntry, 'evidenceCount' | 'expiredEvidence'> {
  risks: (RiskDecision & { ref: string; title: string })[];
  history: AuditEvent[];
}

export interface EvidenceItem {
  id: string;
  ref: string;
  controlTitle: string;
  title: string;
  kind: 'File' | 'Document';
  location: string | null;
  upload: StoredFile | null;
  document: { id: string; title: string } | null;
  datedOn: string;
  expiresOn: string | null;
  addedBy: string;
  state: State<'evidence'>;
}

/** What an entry's status reads as: an excluded control has no implementation to speak of. */
export function controlState(entry: Pick<SoaEntry, 'applicable' | 'status'>): State<'control'> {
  return entry.applicable ? statusLabels[entry.status] : 'Not applicable';
}

/** The form fields on an SoA entry, as the API takes them. */
export function soaEntryPayload(form: FormData) {
  return {
    applicable: form.get('applicable') === 'yes',
    status: form.get('status'),
    justification: form.get('justification'),
    ownerId: form.get('ownerId') || null,
  };
}

/** The fields of EvidenceForm. Uploads first, and removes the upload if the entry is refused. */
export function addEvidence(form: FormData, ref: string) {
  return withUpload(form.get('upload'), ({ stored, file }) =>
    api(`/soa/${ref}/evidence`, {
      method: 'POST',
      body: {
        title: form.get('title') || file?.name || null,
        location: form.get('location') || null,
        storedFileId: stored?.id ?? null,
        documentId: form.get('documentId') || null,
        datedOn: form.get('datedOn'),
        expiresOn: form.get('expiresOn') || null,
      },
    }),
  );
}
