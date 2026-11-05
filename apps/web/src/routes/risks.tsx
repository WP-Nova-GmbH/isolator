import { useMemo } from 'react';
import { Link, useLoaderData } from 'react-router';
import { DetailLayout } from '@/components/detail-layout';
import { PageHeader } from '@/components/page-header';
import { RiskMatrix } from '@/components/risk-matrix';
import { RiskScore } from '@/components/risk-score';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { StateBadge } from '@/components/state-badge';
import { RiskTabs, TabNav, useTabFilter } from '@/components/tab-nav';
import { columnHelper, DataTable } from '@/components/data-table';
import {
  dataCell,
  mainCell,
  NoValue,
  noteCell,
  RecordLink,
  Ref,
} from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

/** Above the threshold and no treatment chosen, so its owner can't confirm it yet. */
function needsTreatment(risk: Risk, threshold: number) {
  return !risk.treatment && risk.likelihood * risk.impact > threshold;
}

const emptyTexts: Record<string, string> = {
  all: 'No risks yet. Add the first one.',
  treatment: 'Every risk above the threshold has a treatment.',
  confirmation: 'No risk is waiting for a Confirmation.',
};

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
  const threshold = criteria.acceptanceThreshold;
  // Each open risk that isn't confirmed waits for one of two things, never both.
  const { toTreat, toConfirm } = useMemo(
    () => ({
      toTreat: risks.filter((risk) => needsTreatment(risk, threshold)),
      toConfirm: risks.filter((risk) => !risk.confirmation && !needsTreatment(risk, threshold)),
    }),
    [risks, threshold],
  );
  const { value, items } = useTabFilter([
    { value: 'all', label: 'All', count: risks.length },
    { value: 'treatment', label: 'Needs treatment', count: toTreat.length },
    { value: 'confirmation', label: 'Needs Confirmation', count: toConfirm.length },
  ]);
  const shown = value === 'treatment' ? toTreat : value === 'confirmation' ? toConfirm : risks;

  return (
    <>
      <PageHeader
        title="Risks"
        description={`Risks above your acceptance threshold of ${threshold} need treatment.`}
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
        <StatGrid label="Risk summary">
          <StatTile
            value={risks.filter((risk) => risk.confirmation).length}
            label={`of ${risks.length} risks confirmed`}
          />
          <StatTile value={toTreat.length} label="above the threshold without treatment" />
          <StatTile value={toConfirm.length} label="waiting for their owner's Confirmation" />
        </StatGrid>
      </DetailLayout>

      <section aria-label="Risk register" className="flex flex-col gap-3">
        <h2>Register</h2>
        <DataTable
          columns={columns}
          data={shown}
          getRowId={(risk) => risk.ref}
          filters={<TabNav label="Risk register filter" items={items} />}
          searchLabel="Search risks"
          emptyText={emptyTexts[value] ?? emptyTexts.all}
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
