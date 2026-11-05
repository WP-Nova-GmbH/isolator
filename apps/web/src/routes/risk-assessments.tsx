import { useMemo } from 'react';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
} from 'react-router';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { RiskTabs } from '@/components/tab-nav';
import { columnHelper, DataTable, sortByOrder } from '@/components/data-table';
import { dataCell, mainCell, RecordLink } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, attempt } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import type { Risk, RiskAssessmentList } from '@/lib/risks';

export async function riskAssessmentsLoader() {
  const [list, risks] = await Promise.all([
    api<RiskAssessmentList>('/risk-assessments'),
    api<Risk[]>('/risks'),
  ]);
  return { ...list, risks };
}

export async function riskAssessmentsAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return attempt(() =>
    form.get('intent') === 'complete'
      ? api(`/risk-assessments/${form.get('id')}/completion`, { method: 'POST' })
      : api('/risk-assessments', { method: 'POST' }),
  );
}

/** A Risk assessment, or the yearly one that is due next. */
interface AssessmentRow {
  id: string;
  date: string;
  title: string;
  /** Only a completed Risk assessment has a page of its own. */
  to?: string;
  risks?: number;
  aboveThreshold?: number;
  completedBy?: string;
  state: 'Planned' | 'In progress' | 'Completed';
}

const column = columnHelper<AssessmentRow>();

const columns = column.columns([
  column.accessor('date', { header: 'Date', meta: { className: dataCell } }),
  column.accessor('title', {
    header: 'Risk assessment',
    meta: { className: mainCell },
    cell: ({ row: { original: row } }) =>
      row.to ? <RecordLink to={row.to}>{row.title}</RecordLink> : row.title,
  }),
  column.accessor('risks', {
    header: 'Risks',
    enableGlobalFilter: false,
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? 'None',
  }),
  column.accessor('aboveThreshold', {
    header: 'Above threshold',
    enableGlobalFilter: false,
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? 'None',
  }),
  column.accessor('completedBy', {
    header: 'Completed by',
    meta: { className: dataCell },
    cell: ({ getValue }) => getValue() ?? 'Not yet',
  }),
  column.accessor('state', {
    header: 'State',
    sortFn: sortByOrder(['Planned', 'In progress', 'Completed'], (row) => row.state),
    cell: ({ getValue }) => <StateBadge kind="assessment" state={getValue()} />,
  }),
]);

export function RiskAssessments() {
  const { canEdit } = usePermissions();
  const { assessments, nextDue, risks } = useLoaderData<typeof riskAssessmentsLoader>();
  const result = useActionData<typeof riskAssessmentsAction>();
  const navigation = useNavigation();
  const inProgress = assessments.find((assessment) => !assessment.completed);
  const unconfirmed = risks.filter((risk) => !risk.confirmation).length;
  const busy = navigation.state !== 'idle';
  const rows = useMemo<AssessmentRow[]>(
    () => [
      ...(nextDue
        ? [{ id: 'planned', date: nextDue, title: 'Yearly review', state: 'Planned' as const }]
        : []),
      ...assessments.map((assessment) => ({
        id: assessment.id,
        date: assessment.date,
        title: assessment.title,
        // An assessment in progress is the register itself.
        to: assessment.completed ? `/risks/assessments/${assessment.id}` : '/risks',
        risks: assessment.risks,
        aboveThreshold: assessment.aboveThreshold,
        completedBy: assessment.completedBy ?? undefined,
        state: assessment.completed ? ('Completed' as const) : ('In progress' as const),
      })),
    ],
    [assessments, nextDue],
  );

  return (
    <>
      <PageHeader
        title="Risks"
        description="Each Risk assessment preserves the register as it stood on that date."
        actions={
          canEdit && (
            <Form method="post">
              {inProgress && <input type="hidden" name="id" value={inProgress.id} />}
              <Button
                type="submit"
                name="intent"
                value={inProgress ? 'complete' : 'start'}
                disabled={busy || (inProgress && (unconfirmed > 0 || risks.length === 0))}
              >
                {inProgress ? 'Complete Risk assessment' : 'Start Risk assessment'}
              </Button>
            </Form>
          )
        }
      />
      <RiskTabs />

      <FormError message={result?.error} />
      {inProgress && unconfirmed > 0 && (
        <Alert>
          <AlertTitle>
            {unconfirmed === 1 ? '1 risk needs' : `${unconfirmed} risks need`} a Confirmation
            before you can complete this Risk assessment
          </AlertTitle>
          <AlertDescription>Each risk owner confirms their own rating and treatment.</AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyText="No Risk assessments yet. Start the first one."
      />
    </>
  );
}
