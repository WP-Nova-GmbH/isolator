import { Fragment } from 'react';
import { useLoaderData } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { DataCell, MainCell, RecordLink, TextLink } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Asset } from '@/lib/assets';
import type { Incident } from '@/lib/incidents';
import { readinessData, readinessGroups } from '@/lib/readiness';
import type { EvidenceItem } from '@/lib/soa';
import type { Supplier } from '@/lib/suppliers';

export async function auditFileLoader() {
  const [data, assets, suppliers, incidents, evidence] = await Promise.all([
    readinessData(),
    api<Asset[]>('/assets'),
    api<Supplier[]>('/suppliers'),
    api<Incident[]>('/incidents'),
    api<EvidenceItem[]>('/evidence'),
  ]);
  return { ...data, assets, suppliers, incidents, evidence };
}

type AuditFileData = Awaited<ReturnType<typeof auditFileLoader>>;

function parts(data: AuditFileData) {
  const { soa, risks, assets, suppliers, incidents, documents, evidence } = data;
  return [
    {
      links: [{ label: 'Statement of Applicability', to: '/soa' }],
      format: 'PDF',
      included: `${soa.length} entries`,
      unconfirmed: soa.filter((entry) => !entry.confirmation).length,
    },
    {
      links: [{ label: 'Risk register and Risk assessments', to: '/risks' }],
      format: 'PDF',
      included: `${risks.length} risks`,
      unconfirmed: risks.filter((risk) => !risk.confirmation).length,
    },
    {
      links: [
        { label: 'Assets', to: '/assets' },
        { label: 'Suppliers', to: '/suppliers' },
      ],
      format: 'PDF',
      included: `${assets.length + suppliers.length} records`,
      unconfirmed: null,
    },
    {
      links: [{ label: 'Incidents', to: '/incidents' }],
      format: 'PDF',
      included: `${incidents.length} records`,
      unconfirmed: null,
    },
    {
      links: [{ label: 'Documents', to: '/documents' }],
      format: 'Original files',
      included: `${documents.length} Documents`,
      unconfirmed: documents.filter((document) => document.versionInForce === null).length,
    },
    {
      links: [{ label: 'Evidence', to: '/evidence' }],
      format: 'Original files',
      included: `${evidence.length} items`,
      unconfirmed: null,
    },
    {
      links: [{ label: 'Audit trail', to: '/audit-trail' }],
      format: 'CSV',
      included: 'Every change',
      unconfirmed: null,
    },
  ];
}

export function AuditFile() {
  const data = useLoaderData<typeof auditFileLoader>();
  const missing = readinessGroups(data)
    .flatMap((group) => group.items)
    .filter((item) => item.state === 'Missing').length;

  return (
    <>
      <PageHeader
        title="Audit file"
        description="Everything you show the certification body."
      />

      {missing > 0 && (
        <Alert>
          <AlertTitle>{missing} items on the Readiness checklist are missing</AlertTitle>
          <AlertDescription>
            <TextLink to="/">Open the checklist</TextLink>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Export not built yet</AlertTitle>
        <AlertDescription>
          For now, the Audit trail exports as CSV and each file downloads from its record.
        </AlertDescription>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2>What goes in</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Included</TableHead>
              <TableHead>Unconfirmed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts(data).map((part) => (
              <TableRow key={part.links[0].to}>
                <MainCell>
                  {part.links.map((link, index) => (
                    <Fragment key={link.to}>
                      {index > 0 && ' and '}
                      <RecordLink to={link.to}>{link.label}</RecordLink>
                    </Fragment>
                  ))}
                </MainCell>
                <TableCell>{part.format}</TableCell>
                <DataCell>{part.included}</DataCell>
                <DataCell>{part.unconfirmed ?? 'None needed'}</DataCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
