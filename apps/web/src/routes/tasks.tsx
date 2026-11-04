import { useState } from 'react';
import { useActionData, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { FormError } from '@/components/form-error';
import { NewTaskForm } from '@/components/new-task-form';
import { PageHeader } from '@/components/page-header';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { TasksTable } from '@/components/tasks-table';
import { Button } from '@/components/ui/button';
import { api, attempt } from '@/lib/api';
import type { Incident } from '@/lib/incidents';
import { useAppData } from '@/lib/members';
import type { Nonconformity } from '@/lib/nonconformities';
import { toTask, type ApiTask, type Risk } from '@/lib/risks';
import type { SoaEntry } from '@/lib/soa';
import type { Supplier } from '@/lib/suppliers';
import { taskIntent } from '@/lib/tasks';

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export async function tasksLoader() {
  const [tasks, risks, soa, suppliers, incidents, nonconformities] = await Promise.all([
    api<ApiTask[]>('/tasks'),
    api<Risk[]>('/risks'),
    api<SoaEntry[]>('/soa'),
    api<Supplier[]>('/suppliers'),
    api<Incident[]>('/incidents?state=open'),
    api<Nonconformity[]>('/nonconformities?state=open'),
  ]);
  return { tasks, risks, soa, suppliers, incidents, nonconformities };
}

export async function tasksAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const [field, ref] = String(form.get('target')).split(':');
  return attempt(async () => taskIntent(form, { [field]: ref }));
}

export function Tasks() {
  const { tasks, risks, soa, suppliers, incidents, nonconformities } =
    useLoaderData<typeof tasksLoader>();
  const { me } = useAppData();
  const result = useActionData<typeof tasksAction>();
  const { value, items } = useTabFilter(tabs);
  const [adding, setAdding] = useState(false);

  const filters: Record<string, (task: ApiTask) => boolean> = {
    mine: (task) => task.ownerId === me.id,
    proposed: (task) => task.state === 'Proposed',
    overdue: (task) => task.state === 'Overdue',
    done: (task) => task.state === 'Done',
    cancelled: (task) => task.state === 'Cancelled',
  };
  const filter = filters[value];
  const targets = [
    {
      group: 'Risks',
      options: risks.map((risk) => ({
        value: `riskRef:${risk.ref}`,
        label: `${risk.ref} ${risk.title}`,
      })),
    },
    {
      group: 'SoA entries',
      options: soa.map((entry) => ({
        value: `soaRef:${entry.ref}`,
        label: `${entry.ref} ${entry.title}`,
      })),
    },
    {
      group: 'Suppliers',
      options: suppliers.map((supplier) => ({
        value: `supplierRef:${supplier.ref}`,
        label: `${supplier.ref} ${supplier.name}`,
      })),
    },
    {
      group: 'Incidents',
      options: incidents.map((incident) => ({
        value: `incidentRef:${incident.ref}`,
        label: `${incident.ref} ${incident.title}`,
      })),
    },
    {
      group: 'Nonconformities',
      options: nonconformities.map((item) => ({
        value: `nonconformityRef:${item.ref}`,
        label: `${item.ref} ${item.title}`,
      })),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="All follow-up work from risks, controls, Suppliers, Incidents and Nonconformities."
        actions={
          <Button type="button" onClick={() => setAdding(true)}>
            New Task
          </Button>
        }
      />
      <FormError message={result?.error} />
      {adding && <NewTaskForm targets={targets} onClose={() => setAdding(false)} />}
      <TabNav label="Task filter" items={items} />
      <TasksTable
        tasks={(filter ? tasks.filter(filter) : tasks).map(toTask)}
        showBelongsTo
        canFinish
        emptyText="No Tasks here."
      />
    </>
  );
}
