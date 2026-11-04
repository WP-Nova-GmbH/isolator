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
import { DataCell, EmptyRow, MainCell, RecordLink } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export function RiskAssessments() {
  const { canEdit } = usePermissions();
  const { assessments, nextDue, risks } = useLoaderData<typeof riskAssessmentsLoader>();
  const result = useActionData<typeof riskAssessmentsAction>();
  const navigation = useNavigation();
  const inProgress = assessments.find((assessment) => !assessment.completed);
  const unconfirmed = risks.filter((risk) => !risk.confirmation).length;
  const busy = navigation.state !== 'idle';

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Risk assessment</TableHead>
            <TableHead>Risks</TableHead>
            <TableHead>Above threshold</TableHead>
            <TableHead>Completed by</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nextDue && (
            <TableRow>
              <DataCell>{nextDue}</DataCell>
              <MainCell>Yearly review</MainCell>
              <DataCell>None</DataCell>
              <DataCell>None</DataCell>
              <DataCell>Not yet</DataCell>
              <TableCell>
                <StateBadge kind="assessment" state="Planned" />
              </TableCell>
            </TableRow>
          )}
          {assessments.map((assessment) => (
            <TableRow key={assessment.id}>
              <DataCell>{assessment.date}</DataCell>
              <MainCell>
                <RecordLink
                  to={assessment.completed ? `/risks/assessments/${assessment.id}` : '/risks'}
                >
                  {assessment.title}
                </RecordLink>
              </MainCell>
              <DataCell>{assessment.risks}</DataCell>
              <DataCell>{assessment.aboveThreshold}</DataCell>
              <DataCell>{assessment.completedBy ?? 'Not yet'}</DataCell>
              <TableCell>
                <StateBadge
                  kind="assessment"
                  state={assessment.completed ? 'Completed' : 'In progress'}
                />
              </TableCell>
            </TableRow>
          ))}
          {assessments.length === 0 && (
            <EmptyRow colSpan={6}>No Risk assessments yet. Start the first one.</EmptyRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
