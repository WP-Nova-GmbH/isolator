import type { State } from '@/components/state-badge';
import { api } from '@/lib/api';

export interface Task {
  id?: string;
  title: string;
  cancelledReason?: string | null;
  belongsTo: { ref: string; label: string; to: string } | null;
  /** Null while a proposed Task has nobody agreed for it, and the same for its due date. */
  ownerId?: string | null;
  owner: string;
  dueOn?: string | null;
  due: string;
  state: State<'task'>;
}

interface BelongsTo {
  riskRef?: string;
  supplierRef?: string;
  incidentRef?: string;
  nonconformityRef?: string;
  soaRef?: string;
}

/** Adds a Task. A proposed one can leave its owner and due date open. */
export function addTask(form: FormData, belongsTo: BelongsTo, proposed = false) {
  return api('/tasks', {
    method: 'POST',
    body: {
      title: form.get('title'),
      proposed,
      ownerId: form.get('ownerId') || null,
      dueOn: form.get('dueOn') || null,
      ...belongsTo,
    },
  });
}

/**
 * Runs the Task forms' intents: add-task, propose-task, commit-task, finish-task and cancel-task.
 * Returns undefined for any other intent.
 */
export function taskIntent(form: FormData, belongsTo: BelongsTo) {
  const path = `/tasks/${form.get('id')}`;
  switch (form.get('intent')) {
    case 'add-task':
      return addTask(form, belongsTo);
    case 'propose-task':
      return addTask(form, belongsTo, true);
    case 'commit-task':
      return api(`${path}/commitment`, {
        method: 'POST',
        body: { ownerId: form.get('ownerId'), dueOn: form.get('dueOn') },
      });
    case 'finish-task':
      return api(`${path}/completion`, { method: 'POST' });
    case 'cancel-task':
      return api(`${path}/cancellation`, {
        method: 'POST',
        body: { reason: form.get('reason') },
      });
  }
}
