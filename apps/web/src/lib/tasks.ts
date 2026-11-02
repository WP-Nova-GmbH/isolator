import type { State } from '@/components/state-badge';
import { api } from '@/lib/api';

export interface Task {
  id?: string;
  title: string;
  cancelledReason?: string | null;
  belongsTo: { ref: string; label: string; to: string } | null;
  owner: string;
  due: string;
  state: State<'task'>;
}

export function addTask(
  form: FormData,
  belongsTo: {
    riskRef?: string;
    supplierRef?: string;
    incidentRef?: string;
    nonconformityRef?: string;
    soaRef?: string;
  },
) {
  return api('/tasks', {
    method: 'POST',
    body: {
      title: form.get('title'),
      ownerId: form.get('ownerId'),
      dueOn: form.get('dueOn'),
      ...belongsTo,
    },
  });
}

export function finishTask(form: FormData) {
  return api(`/tasks/${form.get('id')}/state`, { method: 'PUT', body: { done: true } });
}

export function cancelTask(form: FormData) {
  return api(`/tasks/${form.get('id')}/cancellation`, {
    method: 'POST',
    body: { reason: form.get('reason') },
  });
}
