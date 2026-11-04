import { Link, useLoaderData } from 'react-router';
import { DetailLayout } from '@/components/detail-layout';
import { PageHeader } from '@/components/page-header';
import { RiskMatrix } from '@/components/risk-matrix';
import { RiskScore } from '@/components/risk-score';
import { StateBadge } from '@/components/state-badge';
import { RiskTabs } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function ResidualCell({ risk }: { risk: Risk }) {
  const residual = residualScore(risk);
  if (!residual) return <DataCell>Not set</DataCell>;
  return (
    <TableCell>
      <RiskScore {...residual} />
    </TableCell>
  );
}

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Treatment</TableHead>
            <TableHead>Risk owner</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Confirmation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((risk) => (
            <TableRow key={risk.ref}>
              <TableCell>
                <Ref>{risk.ref}</Ref>
              </TableCell>
              <MainCell>
                <RecordLink to={`/risks/${risk.ref}`}>{risk.title}</RecordLink>
              </MainCell>
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
              <DataCell>{risk.reviewOn}</DataCell>
              <TableCell>
                <StateBadge
                  kind="confirmation"
                  state={risk.confirmation ? 'Confirmed' : 'Draft'}
                />
              </TableCell>
            </TableRow>
          ))}
          {risks.length === 0 && (
            <EmptyRow colSpan={8}>No risks yet. Add the first one.</EmptyRow>
          )}
        </TableBody>
      </Table>

      {closed.length > 0 && (
        <section aria-label="Closed risks" className="flex flex-col gap-3">
          <h2>Closed risks</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Risk owner</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closed.map((risk) => (
                <TableRow key={risk.ref}>
                  <TableCell>
                    <Ref>{risk.ref}</Ref>
                  </TableCell>
                  <MainCell>
                    <RecordLink to={`/risks/${risk.ref}`}>{risk.title}</RecordLink>
                  </MainCell>
                  <TableCell>{risk.ownerName}</TableCell>
                  <DataCell>{risk.closedAt?.slice(0, 10)}</DataCell>
                  <DataCell className="min-w-40 whitespace-normal">{risk.closedReason}</DataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
