import { useState } from 'react';
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { DetailLayout } from '@/components/detail-layout';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { IncidentFields } from '@/components/incident-fields';
import { LifecycleCard, type LifecycleAction } from '@/components/lifecycle-card';
import { NewTaskForm } from '@/components/new-task-form';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { Ref } from '@/components/table-parts';
import { TasksTable } from '@/components/tasks-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import { usePermissions } from '@/lib/members';
import { incidentPayload, type IncidentDetail as Incident } from '@/lib/incidents';
import { toTask, type ApiTask, type Risk } from '@/lib/risks';
import { taskIntent } from '@/lib/tasks';

export async function incidentDetailLoader({ params }: LoaderFunctionArgs) {
  const [incident, tasks, risks] = await Promise.all([
    api<Incident>(`/incidents/${params.ref}`),
    api<ApiTask[]>(`/tasks?incident=${params.ref}`),
    api<Risk[]>('/risks'),
  ]);
  return { incident, tasks: tasks.map(toTask), risks };
}

export async function incidentDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/incidents/${params.ref}`;
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/incidents');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: incidentPayload(form) });
      case 'close':
        return api(`${path}/closure`, { method: 'POST', body: { reason } });
      case 'reopen':
        return api(`${path}/reopening`, { method: 'POST', body: { reason } });
      default:
        return taskIntent(form, { incidentRef: params.ref });
    }
  });
}

function lifecycleProps(incident: Incident) {
  if (incident.closedAt) {
    return {
      title: 'Closed Incident',
      text: 'Reopen this Incident if there is more to do.',
      actions: [
        { intent: 'reopen', label: 'Reopen Incident', prompt: 'Why does this need more work?' },
      ],
    };
  }
  const actions: LifecycleAction[] = [
    { intent: 'close', label: 'Close Incident', prompt: 'How was it resolved?' },
  ];
  if (incident.deletable) {
    actions.push({
      intent: 'delete',
      label: 'Delete Incident',
      prompt: 'Why was this reported by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'Close or delete',
    text: incident.deletable
      ? 'Close this Incident once it is handled. Delete it if it was reported by mistake.'
      : 'Close this Incident once it is handled. It has Tasks on record, so it can’t be deleted.',
    actions,
  };
}

export function IncidentDetail() {
  const { incident, tasks, risks } = useLoaderData<typeof incidentDetailLoader>();
  const result = useActionData<typeof incidentDetailAction>();
  const navigation = useNavigation();
  const [addingTask, setAddingTask] = useState(false);
  const closed = incident.closedAt !== null;
  const { canEdit } = usePermissions();
  const locked = closed || !canEdit;

  return (
    <>
      <PageHeader
        title={incident.title}
        eyebrow={<Ref>{incident.ref}</Ref>}
        back={{ to: '/incidents', label: 'Incidents' }}
        actions={<StateBadge kind="incident" state={incident.state} />}
      />
      <FormError message={result?.error} />
      {closed && (
        <Alert>
          <AlertTitle>
            Closed by {incident.closedBy} on {incident.closedAt?.slice(0, 10)}
          </AlertTitle>
          <AlertDescription>{incident.closedReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            <LifecycleCard key={String(closed)} {...lifecycleProps(incident)} />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(incident.history)} />
            </Card>
          </>
        }
      >
        <Form method="post" className="flex flex-col gap-6">
          <fieldset disabled={locked} className="contents">
            <IncidentFields key={incident.ref} incident={incident} risks={risks} />
          </fieldset>
          {!locked && (
            <div>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="outline"
                disabled={navigation.state !== 'idle'}
              >
                Save changes
              </Button>
            </div>
          )}
        </Form>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Tasks">
            {!locked && (
              <Button type="button" variant="outline" onClick={() => setAddingTask(true)}>
                New Task
              </Button>
            )}
          </SectionHeader>
          {addingTask && <NewTaskForm onClose={() => setAddingTask(false)} />}
          <TasksTable tasks={tasks} canFinish={!closed} emptyText="No Tasks yet." />
        </section>
      </DetailLayout>
    </>
  );
}
