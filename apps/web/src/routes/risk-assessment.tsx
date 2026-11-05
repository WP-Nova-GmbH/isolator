import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { RiskScore } from '@/components/risk-score';
import { columnHelper, DataTable } from '@/components/data-table';
import { dataCell, mainCell, NoValue, Ref } from '@/components/table-parts';
import { api } from '@/lib/api';
import {
  residualScore,
  treatmentLabels,
  type CompletedRiskAssessment,
  type RegisterEntry,
} from '@/lib/risks';

export async function riskAssessmentLoader({ params }: LoaderFunctionArgs) {
  return api<CompletedRiskAssessment>(`/risk-assessments/${params.id}`);
}

const column = columnHelper<RegisterEntry>();

function score(rating: { likelihood: number; impact: number } | null) {
  return rating ? rating.likelihood * rating.impact : undefined;
}

const columns = column.columns([
  column.accessor('ref', { header: 'ID', cell: ({ getValue }) => <Ref>{getValue()}</Ref> }),
  column.accessor('title', { header: 'Risk', meta: { className: `${mainCell} font-medium` } }),
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
  column.accessor('confirmedBy', { header: 'Confirmed by' }),
  column.accessor('confirmedOn', { header: 'Confirmed on', meta: { className: dataCell } }),
]);

/** The register as a completed Risk assessment preserved it. Read-only. */
export function RiskAssessment() {
  const assessment = useLoaderData<typeof riskAssessmentLoader>();

  return (
    <>
      <PageHeader
        title={assessment.title}
        description={`Completed by ${assessment.completedBy} on ${assessment.completedOn}, with an acceptance threshold of ${assessment.acceptanceThreshold}.`}
        back={{ to: '/risks/assessments', label: 'Risk assessments' }}
      />
      <DataTable
        columns={columns}
        data={assessment.register}
        getRowId={(risk) => risk.ref}
        searchLabel="Search risks"
        emptyText="The register was empty when this Risk assessment was completed."
      />
    </>
  );
}
