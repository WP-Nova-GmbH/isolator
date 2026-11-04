import { useState } from 'react';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { ConfirmationCard } from '@/components/confirmation-card';
import { DetailLayout } from '@/components/detail-layout';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { LifecycleCard, type LifecycleAction } from '@/components/lifecycle-card';
import { LinkedItem, LinkPicker } from '@/components/link-picker';
import { NewTaskForm } from '@/components/new-task-form';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { RiskFields } from '@/components/risk-fields';
import { StateBadge } from '@/components/state-badge';
import { Ref } from '@/components/table-parts';
import { TasksTable } from '@/components/tasks-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import { useAppData } from '@/lib/members';
import { taskIntent } from '@/lib/tasks';
import {
  riskPayload,
  toTask,
  type ApiTask,
  type RiskDetail as Risk,
} from '@/lib/risks';

interface Control {
  id: string;
  ref: string;
  title: string;
}

export async function riskDetailLoader({ params }: LoaderFunctionArgs) {
  const [risk, tasks, assets, controls] = await Promise.all([
    api<Risk>(`/risks/${params.ref}`),
    api<ApiTask[]>(`/tasks?risk=${params.ref}`),
    api<{ id: string; name: string }[]>('/assets'),
    api<Control[]>('/controls'),
  ]);
  return { risk, tasks: tasks.map(toTask), assets, controls };
}

export async function riskDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/risks/${params.ref}`;
  const id = form.get('id');
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/risks');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: riskPayload(form) });
      case 'confirm':
        // Saves first, so what is on screen is what gets confirmed.
        await api(path, { method: 'PUT', body: riskPayload(form) });
        return api(`${path}/confirmations`, { method: 'POST' });
      case 'close':
        return api(`${path}/closure`, { method: 'POST', body: { reason } });
      case 'reopen':
        return api(`${path}/reopening`, { method: 'POST', body: { reason } });
      case 'link-asset':
        return api(`${path}/assets`, { method: 'POST', body: { id } });
      case 'unlink-asset':
        return api(`${path}/assets/${id}`, { method: 'DELETE' });
      case 'link-control':
        return api(`${path}/controls`, { method: 'POST', body: { id } });
      case 'unlink-control':
        return api(`${path}/controls/${id}`, { method: 'DELETE' });
      default:
        return taskIntent(form, { riskRef: params.ref });
    }
  });
}

function confirmationCardProps(risk: Risk, memberId: string) {
  if (risk.confirmation) {
    const date = risk.confirmation.at.slice(0, 10);
    return { text: `${risk.confirmation.by} confirmed this rating and treatment on ${date}.` };
  }
  const lead = risk.everConfirmed ? 'This risk needs a new Confirmation. ' : '';
  if (risk.ownerId === memberId) {
    return {
      text: `${lead}Confirm this rating and treatment as the risk owner.`,
      action: 'Confirm rating',
      form: 'risk-form',
    };
  }
  return {
    text: `${lead}Only ${risk.ownerName}, the risk owner, can confirm this rating and treatment.`,
    action: 'Confirm rating',
    disabled: true,
  };
}

function lifecycleProps(risk: Risk, isOwner: boolean) {
  if (risk.closedAt) {
    return {
      title: 'Closed risk',
      text: isOwner
        ? 'Reopen this risk if it applies again. It will need a new Confirmation.'
        : `Only ${risk.ownerName}, the risk owner, can reopen this risk.`,
      actions: isOwner
        ? [{ intent: 'reopen', label: 'Reopen risk', prompt: 'Why does this risk apply again?' }]
        : [],
    };
  }
  const closing = isOwner
    ? 'Close this risk when it no longer applies. It stays on record.'
    : `Only ${risk.ownerName}, the risk owner, can close this risk.`;
  const actions: LifecycleAction[] = [];
  if (isOwner) {
    actions.push({
      intent: 'close',
      label: 'Close risk',
      prompt: 'Why does this risk no longer apply?',
    });
  }
  if (!risk.everConfirmed) {
    actions.push({
      intent: 'delete',
      label: 'Delete risk',
      prompt: 'Why was this entered by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'Close or delete',
    text: risk.everConfirmed
      ? `${closing} It has a Confirmation, so it can't be deleted.`
      : `${closing} Delete it if it was entered by mistake.`,
    actions,
  };
}

export function RiskDetail() {
  const { risk, tasks, assets, controls } = useLoaderData<typeof riskDetailLoader>();
  const { me } = useAppData();
  const result = useActionData<typeof riskDetailAction>();
  const navigation = useNavigation();
  const [addingTask, setAddingTask] = useState(false);
  const closed = risk.closedAt !== null;

  const linkedAssets = new Set(risk.assets.map((asset) => asset.id));
  const linkedControls = new Set(risk.controls.map((control) => control.id));

  return (
    <>
      <PageHeader
        title={risk.title}
        eyebrow={<Ref>{risk.ref}</Ref>}
        back={{ to: '/risks', label: 'Risks' }}
        actions={
          closed ? (
            <StateBadge kind="risk" state="Closed" />
          ) : (
            <StateBadge kind="confirmation" state={risk.confirmation ? 'Confirmed' : 'Draft'} />
          )
        }
      />
      <FormError message={result?.error} />
      {closed && (
        <Alert>
          <AlertTitle>Closed on {risk.closedAt?.slice(0, 10)}</AlertTitle>
          <AlertDescription>{risk.closedReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            {!closed && <ConfirmationCard {...confirmationCardProps(risk, me.id)} />}
            <LifecycleCard
              key={String(closed)}
              {...lifecycleProps(risk, risk.ownerId === me.id)}
            />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(risk.history)} />
            </Card>
          </>
        }
      >
        <Form id="risk-form" method="post" className="flex flex-col gap-6">
          <fieldset disabled={closed} className="contents">
            <RiskFields key={risk.ref} risk={risk} />
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
          <SectionHeader title="Treatment Tasks">
            {!closed && (
              <Button type="button" variant="outline" onClick={() => setAddingTask(true)}>
                New Task
              </Button>
            )}
          </SectionHeader>
          {addingTask && <NewTaskForm onClose={() => setAddingTask(false)} />}
          <TasksTable tasks={tasks} canFinish={!closed} emptyText="No Tasks yet." />
        </section>

        <section
          aria-label="Linked records"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3"
        >
          <Card className="flex flex-col gap-3">
            <SectionHeader title="Assets">
              {!closed && (
                <LinkPicker
                  label="Link asset"
                  intent="link-asset"
                  options={assets
                    .filter((asset) => !linkedAssets.has(asset.id))
                    .map((asset) => ({ id: asset.id, label: asset.name }))}
                />
              )}
            </SectionHeader>
            {risk.assets.map((asset) => (
              <LinkedItem
                key={asset.id}
                id={asset.id}
                intent="unlink-asset"
                label={asset.name}
                locked={closed}
              >
                {asset.name}
              </LinkedItem>
            ))}
            {risk.assets.length === 0 && (
              <p className="text-muted-foreground">No assets linked yet.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <SectionHeader title="Controls">
              {!closed && (
                <LinkPicker
                  label="Link control"
                  intent="link-control"
                  options={controls
                    .filter((control) => !linkedControls.has(control.id))
                    .map((control) => ({
                      id: control.id,
                      label: `${control.ref} ${control.title}`,
                    }))}
                />
              )}
            </SectionHeader>
            {risk.controls.map((control) => (
              <LinkedItem
                key={control.id}
                id={control.id}
                intent="unlink-control"
                label={control.ref}
                locked={closed}
              >
                <Ref>{control.ref}</Ref>
                <Link to={`/soa/${control.ref}`} className="min-w-0 hover:underline">
                  {control.title}
                </Link>
              </LinkedItem>
            ))}
            {risk.controls.length === 0 && (
              <p className="text-muted-foreground">No controls linked yet.</p>
            )}
          </Card>
        </section>
      </DetailLayout>
    </>
  );
}
