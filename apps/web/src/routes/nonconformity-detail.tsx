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
import { LifecycleCard, type LifecycleAction } from '@/components/lifecycle-card';
import { NewTaskForm } from '@/components/new-task-form';
import { NonconformityFields } from '@/components/nonconformity-fields';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { Ref } from '@/components/table-parts';
import { TasksTable } from '@/components/tasks-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import { nonconformityPayload, type NonconformityDetail as Details } from '@/lib/nonconformities';
import { toTask, type ApiTask } from '@/lib/risks';
import { taskIntent } from '@/lib/tasks';

export async function nonconformityDetailLoader({ params }: LoaderFunctionArgs) {
  const [nonconformity, tasks] = await Promise.all([
    api<Details>(`/nonconformities/${params.ref}`),
    api<ApiTask[]>(`/tasks?nonconformity=${params.ref}`),
  ]);
  return { nonconformity, tasks: tasks.map(toTask) };
}

export async function nonconformityDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/nonconformities/${params.ref}`;
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/nonconformities');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: nonconformityPayload(form) });
      case 'close':
        return api(`${path}/closure`, { method: 'POST', body: { reason } });
      case 'reopen':
        return api(`${path}/reopening`, { method: 'POST', body: { reason } });
      default:
        return taskIntent(form, { nonconformityRef: params.ref });
    }
  });
}

function lifecycleProps(nonconformity: Details) {
  if (nonconformity.closedAt) {
    return {
      title: 'Closed Nonconformity',
      text: 'Reopen this Nonconformity if it wasn’t fixed after all.',
      actions: [
        {
          intent: 'reopen',
          label: 'Reopen Nonconformity',
          prompt: 'Why does this need more work?',
        },
      ],
    };
  }
  const actions: LifecycleAction[] = [
    { intent: 'close', label: 'Close Nonconformity', prompt: 'How do you know it is fixed?' },
  ];
  if (nonconformity.deletable) {
    actions.push({
      intent: 'delete',
      label: 'Delete Nonconformity',
      prompt: 'Why was this recorded by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'Close or delete',
    text: nonconformity.deletable
      ? 'Close this once it is corrected and you have checked that it worked. Delete it if it was recorded by mistake.'
      : 'Close this once it is corrected and you have checked that it worked. It has Tasks on record, so it can’t be deleted.',
    actions,
  };
}

export function NonconformityDetail() {
  const { nonconformity, tasks } = useLoaderData<typeof nonconformityDetailLoader>();
  const result = useActionData<typeof nonconformityDetailAction>();
  const navigation = useNavigation();
  const [addingTask, setAddingTask] = useState(false);
  const closed = nonconformity.closedAt !== null;
  const { canEdit } = usePermissions();
  const locked = closed || !canEdit;

  return (
    <>
      <PageHeader
        title={nonconformity.title}
        eyebrow={<Ref>{nonconformity.ref}</Ref>}
        back={{ to: '/nonconformities', label: 'Nonconformities' }}
        actions={<StateBadge kind="nonconformity" state={nonconformity.state} />}
      />
      <FormError message={result?.error} />
      {closed && (
        <Alert>
          <AlertTitle>
            Closed by {nonconformity.closedBy} on {nonconformity.closedAt?.slice(0, 10)}
          </AlertTitle>
          <AlertDescription>{nonconformity.closedReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            <LifecycleCard key={String(closed)} {...lifecycleProps(nonconformity)} />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(nonconformity.history)} />
            </Card>
          </>
        }
      >
        <Form method="post" className="flex flex-col gap-6">
          <fieldset disabled={locked} className="contents">
            <NonconformityFields key={nonconformity.ref} nonconformity={nonconformity} />
          </fieldset>
          {!closed && (
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
            {!closed && (
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
