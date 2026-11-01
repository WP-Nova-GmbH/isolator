import { Link, useLoaderData } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { GroupRow, MainCell, Ref, TextLink } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { longDate } from '@/lib/dates';
import { useAppData } from '@/lib/members';
import {
  readinessData,
  readinessGroups,
  type ReadinessGroup,
  type ReadinessItem,
} from '@/lib/readiness';
import type { EvidenceItem } from '@/lib/soa';

export async function overviewLoader() {
  const [data, evidence] = await Promise.all([readinessData(), api<EvidenceItem[]>('/evidence')]);
  return { ...data, evidence };
}

type RiskData = Pick<Awaited<ReturnType<typeof overviewLoader>>, 'risks' | 'assessments'>;

function nextStep({ risks, assessments }: RiskData, items: ReadinessItem[]) {
  const unconfirmed = risks.filter((risk) => !risk.confirmation).length;
  if (unconfirmed > 0) {
    return {
      text:
        unconfirmed === 1
          ? '1 risk has no Confirmation yet.'
          : `${unconfirmed} risks have no Confirmation yet.`,
      to: '/risks',
      label: 'Review risks',
    };
  }
  if (assessments.some((assessment) => !assessment.completed)) {
    return {
      text: 'Every risk has a Confirmation. Complete the Risk assessment.',
      to: '/risks/assessments',
      label: 'Open Risk assessment',
    };
  }
  const next = items.find((item) => item.state !== 'Done');
  if (next) {
    return {
      text: `Next on the checklist: ${next.title}.`,
      to: next.where.to,
      label: `Open ${next.where.label}`,
    };
  }
  return { text: 'The checklist is done.', to: '/audit-file', label: 'Open Audit file' };
}

export function Overview() {
  const data = useLoaderData<typeof overviewLoader>();
  const { me } = useAppData();
  const groups = readinessGroups(data);
  const items = groups.flatMap((group) => group.items);
  const done = items.filter((item) => item.state === 'Done').length;
  const drafted = items.filter((item) => item.state === 'Drafted').length;
  const missing = items.filter((item) => item.state === 'Missing').length;
  const expired = data.evidence.find((item) => item.state === 'Expired');
  const next = nextStep(data, items);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`What ${me.organizationName} still needs for its ISO/IEC 27001:2022 certificate.`}
      />

      {expired?.expiresOn && (
        <Alert variant="destructive">
          <AlertTitle>
            Evidence for {expired.ref} expired on {longDate(expired.expiresOn)}
          </AlertTitle>
          <AlertDescription>Replace “{expired.title}” with something current.</AlertDescription>
        </Alert>
      )}

      <section aria-label="Readiness summary" className="flex flex-wrap gap-3">
        <Card aria-label="Readiness" className="flex flex-[2_1_23.75rem] flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">Readiness</span>
            <span className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
              {done} of {items.length} done
            </span>
          </div>
          <div
            role="img"
            aria-label={`${done} done, ${drafted} drafted, ${missing} missing`}
            className="flex h-2 gap-0.75"
          >
            <span className="min-w-2 rounded-full bg-success" style={{ flex: `${done} 1 0` }} />
            <span className="min-w-2 rounded-full bg-info" style={{ flex: `${drafted} 1 0` }} />
            <span
              className="min-w-2 rounded-full bg-neutral-subtle"
              style={{ flex: `${missing} 1 0` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge kind="readiness" state="Done" label={`${done} Done`} />
            <StateBadge kind="readiness" state="Drafted" label={`${drafted} Drafted`} />
            <StateBadge kind="readiness" state="Missing" label={`${missing} Missing`} />
          </div>
        </Card>
        <Card
          aria-label="Next step"
          className="flex flex-[1_1_16.25rem] flex-col items-start gap-2 border-transparent bg-selected"
        >
          <span className="text-xs font-medium text-muted-foreground">Next step</span>
          <p>{next.text}</p>
          <Button asChild className="mt-auto">
            <Link to={next.to}>{next.label}</Link>
          </Button>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Readiness checklist</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>What the certificate needs</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <ReadinessRows key={group.title} group={group} />
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function ReadinessRows({ group }: { group: ReadinessGroup }) {
  return (
    <>
      <GroupRow colSpan={4}>{group.title}</GroupRow>
      {group.items.map((item) => (
        <TableRow key={item.title}>
          <TableCell>
            <Ref>{item.ref}</Ref>
          </TableCell>
          <MainCell>{item.title}</MainCell>
          <TableCell>
            <TextLink to={item.where.to}>{item.where.label}</TextLink>
          </TableCell>
          <TableCell>
            <StateBadge kind="readiness" state={item.state} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
