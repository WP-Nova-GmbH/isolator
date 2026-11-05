import { Link, useLoaderData } from 'react-router';
import { DetailLayout } from '@/components/detail-layout';
import { PageHeader } from '@/components/page-header';
import { RiskMatrix } from '@/components/risk-matrix';
import { RiskScore } from '@/components/risk-score';
import { StateBadge } from '@/components/state-badge';
import { RiskTabs } from '@/components/tab-nav';
import { columnHelper, DataTable } from '@/components/data-table';
import {
  DataCell,
  dataCell,
  EmptyRow,
  MainCell,
  mainCell,
  NoValue,
  noteCell,
  RecordLink,
  Ref,
} from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/members';
import {
  currentScore,
  residualScore,
  treatmentLabels,
  type Risk,
  type RiskCriteria,
} from '@/lib/risks';

export async function risksLoader() {
  const [risks, closed, criteria] = await Promise.all([
    api<Risk[]>('/risks'),
    api<Risk[]>('/risks?state=closed'),
    api<RiskCriteria>('/risk-criteria'),
  ]);
  return { risks, closed, criteria };
}

function attentionNote(risk: Risk, threshold: number) {
  if (!risk.treatment && risk.likelihood * risk.impact > threshold) {
    return 'Above the threshold, no treatment yet';
  }
  return `Needs Confirmation from ${risk.ownerName}`;
}

const column = columnHelper<Risk>();

function score(rating: { likelihood: number; impact: number } | null) {
  return rating ? rating.likelihood * rating.impact : undefined;
}

const columns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', {
    header: 'Risk',
    meta: { className: mainCell },
    cell: ({ row: { original: risk } }) => (
      <RecordLink to={`/risks/${risk.ref}`}>{risk.title}</RecordLink>
    ),
  }),
  column.accessor((risk) => score(risk), {
    id: 'before',
    header: 'Before',
    enableGlobalFilter: false,
    cell: ({ row: { original: risk } }) => (
      <RiskScore likelihood={risk.likelihood} impact={risk.impact} />
    ),
  }),
  column.accessor((risk) => score(residualScore(risk)), {
    id: 'after',
    header: 'After',
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const residual = residualScore(row.original);
      return residual ? <RiskScore {...residual} /> : <NoValue>Not set</NoValue>;
    },
  }),
  column.accessor((risk) => (risk.treatment ? treatmentLabels[risk.treatment] : undefined), {
    id: 'treatment',
    header: 'Treatment',
    cell: ({ getValue }) => getValue() ?? <NoValue>Not set</NoValue>,
  }),
  column.accessor('ownerName', { id: 'owner', header: 'Risk owner' }),
  column.accessor('reviewOn', { header: 'Review', meta: { className: dataCell } }),
  column.accessor((risk) => (risk.confirmation ? 'Confirmed' : 'Draft'), {
    id: 'confirmation',
    header: 'Confirmation',
    cell: ({ getValue }) => <StateBadge kind="confirmation" state={getValue()} />,
  }),
]);

const closedColumns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', {
    header: 'Risk',
    meta: { className: mainCell },
    cell: ({ row: { original: risk } }) => (
      <RecordLink to={`/risks/${risk.ref}`}>{risk.title}</RecordLink>
    ),
  }),
  column.accessor('ownerName', { id: 'owner', header: 'Risk owner' }),
  column.accessor((risk) => risk.closedAt?.slice(0, 10), {
    id: 'closed',
    header: 'Closed',
    meta: { className: dataCell },
  }),
  column.accessor('closedReason', { header: 'Why', meta: { className: noteCell } }),
]);

export function Risks() {
  const { canEdit } = usePermissions();
  const { risks, closed, criteria } = useLoaderData<typeof risksLoader>();
  const needsAttention = risks.filter((risk) => !risk.confirmation);

  return (
    <>
      <PageHeader
        title="Risks"
        description={`Risks above your acceptance threshold of ${criteria.acceptanceThreshold} need treatment.`}
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/risks/new">Add risk</Link>
            </Button>
          )
        }
      />
      <RiskTabs />

      <DetailLayout
        aside={
          <Card aria-label="Risk matrix, after treatment" className="flex flex-col gap-3">
            <h2>After treatment</h2>
            <RiskMatrix scores={risks.map(currentScore)} />
            <p className="text-xs text-muted-foreground">
              Likelihood up, impact across. Solid cells hold risks. Untreated risks count at their
              rating before treatment.
            </p>
          </Card>
        }
      >
        <section aria-label="Needs attention" className="flex flex-col gap-3">
          <h2>Needs attention</h2>
          <Table>
            <TableBody>
              {needsAttention.map((risk) => (
                <TableRow key={risk.ref}>
                  <MainCell>
                    <RecordLink to={`/risks/${risk.ref}`}>{risk.title}</RecordLink>
                  </MainCell>
                  <DataCell className="whitespace-normal">
                    {attentionNote(risk, criteria.acceptanceThreshold)}
                  </DataCell>
                </TableRow>
              ))}
              {needsAttention.length === 0 && (
                <EmptyRow colSpan={2}>Every risk has a Confirmation.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </section>
      </DetailLayout>

      <section aria-label="Risk register" className="flex flex-col gap-3">
        <h2>Register</h2>
        <DataTable
          columns={columns}
          data={risks}
          getRowId={(risk) => risk.ref}
          searchLabel="Search risks"
          emptyText="No risks yet. Add the first one."
        />
      </section>

      {closed.length > 0 && (
        <section aria-label="Closed risks" className="flex flex-col gap-3">
          <h2>Closed risks</h2>
          <DataTable
            columns={closedColumns}
            data={closed}
            getRowId={(risk) => risk.ref}
            paramPrefix="closed-"
            emptyText="No closed risks."
          />
        </section>
      )}
    </>
  );
}
