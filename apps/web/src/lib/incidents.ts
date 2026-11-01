import type { State } from '@/components/state-badge';
import type { AuditEvent } from '@/lib/audit';

export interface Incident {
  ref: string;
  title: string;
  occurredOn: string;
  ownerId: string;
  ownerName: string;
  risk: { ref: string; title: string } | null;
  closedAt: string | null;
  closedBy: string | null;
  closedReason: string | null;
  state: State<'incident'>;
}

export interface IncidentDetail extends Incident {
  description: string;
  deletable: boolean;
  history: AuditEvent[];
}

/** The form fields in IncidentFields, as the API takes them. */
export function incidentPayload(form: FormData) {
  return {
    title: form.get('title'),
    description: form.get('description'),
    occurredOn: form.get('occurredOn'),
    ownerId: form.get('ownerId'),
    riskRef: form.get('riskRef') || null,
  };
}
