import { useState } from 'react';
import { useActionData, useLoaderData, type ActionFunctionArgs } from 'react-router';
import { EvidenceForm } from '@/components/evidence-form';
import { EvidenceTable } from '@/components/evidence-table';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { api, attempt } from '@/lib/api';
import type { IsmsDocument } from '@/lib/documents';
import { addEvidence, type EvidenceItem, type SoaEntry } from '@/lib/soa';

export async function evidenceLoader() {
  const [evidence, entries, documents] = await Promise.all([
    api<EvidenceItem[]>('/evidence'),
    api<SoaEntry[]>('/soa'),
    api<IsmsDocument[]>('/documents'),
  ]);
  return { evidence, entries, documents };
}

export async function evidenceAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return attempt(() =>
    form.get('intent') === 'remove-evidence'
      ? api(`/evidence/${form.get('id')}`, { method: 'DELETE' })
      : addEvidence(form, String(form.get('ref'))),
  );
}

export function Evidence() {
  const { evidence, entries, documents } = useLoaderData<typeof evidenceLoader>();
  const result = useActionData<typeof evidenceAction>();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Dated proof that your controls are working, attached to SoA entries."
        actions={
          <Button type="button" onClick={() => setAdding(true)}>
            Add Evidence
          </Button>
        }
      />
      <FormError message={result?.error} />
      {adding && (
        <EvidenceForm entries={entries} documents={documents} onClose={() => setAdding(false)} />
      )}

      <StatGrid label="Evidence summary">
        <StatTile
          value={evidence.filter((item) => item.state === 'Expired').length}
          label="expired"
        />
        <StatTile
          value={evidence.filter((item) => item.state === 'Expires soon').length}
          label="expires within 30 days"
        />
        <StatTile
          value={entries.filter((entry) => entry.applicable && entry.evidenceCount === 0).length}
          label="applicable SoA entries with no Evidence"
        />
      </StatGrid>

      <EvidenceTable items={evidence} showControl />
    </>
  );
}
