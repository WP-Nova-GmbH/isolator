import { useState } from 'react';
import {
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { ConfirmationCard } from '@/components/confirmation-card';
import { DetailLayout } from '@/components/detail-layout';
import { EvidenceForm } from '@/components/evidence-form';
import { EvidenceTable } from '@/components/evidence-table';
import { Fact, Facts } from '@/components/facts';
import { Field, FieldGrid } from '@/components/field';
import { EditDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { OwnerSelect, UNASSIGNED } from '@/components/owner-select';
import { HistoryList } from '@/components/history-list';
import { NewTaskForm } from '@/components/new-task-form';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { RiskScore } from '@/components/risk-score';
import { StateBadge } from '@/components/state-badge';
import { RecordLink, Ref } from '@/components/table-parts';
import { TasksTable } from '@/components/tasks-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import type { IsmsDocument } from '@/lib/documents';
import { usePermissions } from '@/lib/members';
import { currentScore, toTask, type ApiTask } from '@/lib/risks';
import {
  addEvidence,
  controlState,
  soaEntryPayload,
  statusLabels,
  type EvidenceItem,
  type SoaEntryDetail,
} from '@/lib/soa';
import { taskIntent } from '@/lib/tasks';

export async function soaEntryLoader({ params }: LoaderFunctionArgs) {
  const [entry, evidence, tasks, documents] = await Promise.all([
    api<SoaEntryDetail>(`/soa/${params.ref}`),
    api<EvidenceItem[]>(`/evidence?soa=${params.ref}`),
    api<ApiTask[]>(`/tasks?soa=${params.ref}`),
    api<IsmsDocument[]>('/documents'),
  ]);
  return { entry, evidence, tasks: tasks.map(toTask), documents };
}

export async function soaEntryAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/soa/${params.ref}`;

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: soaEntryPayload(form) });
      case 'confirm':
        return api(`${path}/confirmations`, { method: 'POST' });
      case 'add-evidence':
        return addEvidence(form, params.ref!);
      case 'remove-evidence':
        return api(`/evidence/${form.get('id')}`, { method: 'DELETE' });
      default:
        return taskIntent(form, { soaRef: params.ref });
    }
  });
}

function confirmationProps(entry: SoaEntryDetail) {
  if (entry.confirmation) {
    const date = entry.confirmation.at.slice(0, 10);
    return { text: `${entry.confirmation.by} confirmed this entry on ${date}.` };
  }
  return {
    text: entry.everConfirmed
      ? 'This entry changed since its last Confirmation. Confirm it to record the change.'
      : 'This entry has no Confirmation yet.',
    action: 'Confirm entry',
  };
}

/** The decision's fields, in the Edit dialog. soaEntryPayload reads them back out. */
function DecisionFields({ entry }: { entry: SoaEntryDetail }) {
  return (
    <>
      <FieldGrid>
        <Field label="Applies" htmlFor="applicable">
          <NativeSelect
            id="applicable"
            name="applicable"
            defaultValue={entry.applicable ? 'yes' : 'no'}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </NativeSelect>
        </Field>
        <Field label="Implementation status" htmlFor="status">
          <NativeSelect id="status" name="status" defaultValue={entry.status}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <OwnerSelect id="ownerId" name="ownerId" defaultValue={entry.ownerId} unassigned />
        </Field>
      </FieldGrid>
      <Field label="Justification" htmlFor="justification">
        <Textarea id="justification" name="justification" defaultValue={entry.justification} />
      </Field>
    </>
  );
}

export function SoaEntry() {
  const { entry, evidence, tasks, documents } = useLoaderData<typeof soaEntryLoader>();
  const { canEdit } = usePermissions();
  const result = useActionData<typeof soaEntryAction>();
  const [adding, setAdding] = useState<'evidence' | 'task' | null>(null);

  return (
    <>
      <PageHeader
        title={entry.title}
        eyebrow={<Ref>{entry.ref}</Ref>}
        back={{ to: '/soa', label: 'Statement of Applicability' }}
        actions={
          <>
            <StateBadge kind="control" state={controlState(entry)} />
            <StateBadge kind="confirmation" state={entry.confirmation ? 'Confirmed' : 'Draft'} />
            {canEdit && (
              <EditDialog title={`Edit ${entry.ref}`}>
                <DecisionFields entry={entry} />
              </EditDialog>
            )}
          </>
        }
      />
      <FormError message={result?.error} />

      <DetailLayout
        aside={
          <>
            <ConfirmationCard {...confirmationProps(entry)} />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              {entry.history.length > 0 ? (
                <HistoryList items={historyItems(entry.history)} />
              ) : (
                <p className="text-muted-foreground">No changes yet.</p>
              )}
            </Card>
            <Card aria-label="Linked risks" className="flex flex-col gap-3">
              <h2>Linked risks</h2>
              {entry.risks.map((risk) => (
                <div key={risk.ref} className="flex items-center justify-between gap-2">
                  <RecordLink to={`/risks/${risk.ref}`} className="font-normal">
                    {risk.title}
                  </RecordLink>
                  <RiskScore {...currentScore(risk)} />
                </div>
              ))}
              {entry.risks.length === 0 && (
                <p className="text-muted-foreground">No risks linked yet.</p>
              )}
            </Card>
          </>
        }
      >
        <Card aria-label="Decision" className="flex flex-col gap-4">
          <h2>Decision</h2>
          <Facts>
            <Fact label="Applies">{entry.applicable ? 'Yes' : 'No'}</Fact>
            <Fact label="Implementation status">{statusLabels[entry.status]}</Fact>
            <Fact label="Owner" empty={UNASSIGNED}>
              {entry.ownerName}
            </Fact>
            <Fact label="Justification" empty="None yet" wide>
              {entry.justification}
            </Fact>
          </Facts>
        </Card>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Evidence">
            {canEdit && (
              <Button type="button" variant="outline" onClick={() => setAdding('evidence')}>
                Add Evidence
              </Button>
            )}
          </SectionHeader>
          {adding === 'evidence' && (
            <EvidenceForm documents={documents} onClose={() => setAdding(null)} />
          )}
          <EvidenceTable items={evidence} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Tasks">
            {canEdit && (
              <Button type="button" variant="outline" onClick={() => setAdding('task')}>
                New Task
              </Button>
            )}
          </SectionHeader>
          {adding === 'task' && <NewTaskForm onClose={() => setAdding(null)} />}
          <TasksTable tasks={tasks} canFinish emptyText="No Tasks yet." />
        </section>
      </DetailLayout>
    </>
  );
}
