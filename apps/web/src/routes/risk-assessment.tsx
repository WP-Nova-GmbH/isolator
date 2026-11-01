import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { RiskScore } from '@/components/risk-score';
import { DataCell, MainCell, Ref } from '@/components/table-parts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function ResidualCell({ risk }: { risk: RegisterEntry }) {
  const residual = residualScore(risk);
  if (!residual) return <DataCell>Not set</DataCell>;
  return (
    <TableCell>
      <RiskScore {...residual} />
    </TableCell>
  );
}

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Treatment</TableHead>
            <TableHead>Risk owner</TableHead>
            <TableHead>Confirmed by</TableHead>
            <TableHead>Confirmed on</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assessment.register.map((risk) => (
            <TableRow key={risk.ref}>
              <TableCell>
                <Ref>{risk.ref}</Ref>
              </TableCell>
              <MainCell className="font-medium">{risk.title}</MainCell>
              <TableCell>
                <RiskScore likelihood={risk.likelihood} impact={risk.impact} />
              </TableCell>
              <ResidualCell risk={risk} />
              {risk.treatment ? (
                <TableCell>{treatmentLabels[risk.treatment]}</TableCell>
              ) : (
                <DataCell>Not set</DataCell>
              )}
              <TableCell>{risk.ownerName}</TableCell>
              <TableCell>{risk.confirmedBy}</TableCell>
              <DataCell>{risk.confirmedOn}</DataCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
