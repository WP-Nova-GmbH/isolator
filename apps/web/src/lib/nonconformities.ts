import type { State } from '@/components/state-badge';
import type { AuditEvent } from '@/lib/audit';

export interface Nonconformity {
  ref: string;
  title: string;
  foundIn: string;
  foundOn: string;
  ownerId: string;
  ownerName: string;
  openTasks: number;
  closedAt: string | null;
  closedBy: string | null;
  closedReason: string | null;
  state: State<'nonconformity'>;
}

export interface NonconformityDetail extends Nonconformity {
  description: string;
  cause: string;
  deletable: boolean;
  history: AuditEvent[];
}

/** The form fields in NonconformityFields, as the API takes them. */
export function nonconformityPayload(form: FormData) {
  return {
    title: form.get('title'),
    description: form.get('description'),
    foundIn: form.get('foundIn'),
    foundOn: form.get('foundOn'),
    cause: form.get('cause'),
    ownerId: form.get('ownerId'),
  };
}
