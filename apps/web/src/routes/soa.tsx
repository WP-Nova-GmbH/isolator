import { useState } from 'react';
import { useLoaderData, type ActionFunctionArgs } from 'react-router';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { StateBadge } from '@/components/state-badge';
import { TabNav, useTabFilter } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, attempt } from '@/lib/api';
import { controlState, type SoaEntry } from '@/lib/soa';
import { useFormFetcher } from '@/lib/use-form-fetcher';

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'organizational', label: 'Organizational' },
  { value: 'people', label: 'People' },
  { value: 'physical', label: 'Physical' },
  { value: 'technological', label: 'Technological' },
  { value: 'own', label: 'Own controls' },
];

export function soaLoader() {
  return api<SoaEntry[]>('/soa');
}

export async function soaAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return attempt(() => api('/soa', { method: 'POST', body: { title: form.get('title') } }));
}

function EvidenceCell({ entry }: { entry: SoaEntry }) {
  if (entry.expiredEvidence > 0) {
    return (
      <TableCell>
        <StateBadge kind="evidence" state="Expired" label={`${entry.expiredEvidence} expired`} />
      </TableCell>
    );
  }
  return <DataCell>{entry.evidenceCount}</DataCell>;
}

function secondLine(entry: SoaEntry) {
  if (entry.own) return 'Own control';
  return entry.applicable ? null : entry.justification;
}

function OwnControlForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <Card aria-label="Add own control">
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <FormError message={fetcher.data?.error} />
        <Field label="What the control is" htmlFor="own-title">
          <Input id="own-title" name="title" required autoFocus />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={fetcher.state !== 'idle'}>
            Add control
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

export function Soa() {
  const all = useLoaderData<typeof soaLoader>();
  const { value, items } = useTabFilter(tabs);
  const [adding, setAdding] = useState(false);
  const entries = value === 'all' ? all : all.filter((entry) => entry.theme === value);

  return (
    <>
      <PageHeader
        title="Statement of Applicability"
        description="One entry per control, including your own."
        actions={
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            Add own control
          </Button>
        }
      />
      {adding && <OwnControlForm onClose={() => setAdding(false)} />}

      <StatGrid label="SoA summary">
        <StatTile
          value={all.filter((entry) => entry.confirmation).length}
          label={`of ${all.length} entries confirmed`}
        />
        <StatTile
          value={all.filter((entry) => !entry.justification).length}
          label="without a justification"
        />
        <StatTile value={all.filter((entry) => !entry.ownerId).length} label="without an owner" />
        <StatTile
          value={all.filter((entry) => entry.expiredEvidence > 0).length}
          label="with expired Evidence"
        />
      </StatGrid>

      <TabNav label="Control themes" items={items} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Control</TableHead>
            <TableHead>Applies</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Confirmation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.ref}>
              <TableCell>
                <Ref>{entry.ref}</Ref>
              </TableCell>
              <MainCell>
                <RecordLink to={`/soa/${entry.ref}`}>{entry.title}</RecordLink>
                {secondLine(entry) && (
                  <div className="text-xs text-muted-foreground">{secondLine(entry)}</div>
                )}
              </MainCell>
              <TableCell>{entry.applicable ? 'Yes' : 'No'}</TableCell>
              <TableCell>
                <StateBadge kind="control" state={controlState(entry)} />
              </TableCell>
              {entry.ownerName ? (
                <TableCell>{entry.ownerName}</TableCell>
              ) : (
                <DataCell>None</DataCell>
              )}
              <EvidenceCell entry={entry} />
              <TableCell>
                <StateBadge
                  kind="confirmation"
                  state={entry.confirmation ? 'Confirmed' : 'Draft'}
                />
              </TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && <EmptyRow colSpan={7}>No entries here.</EmptyRow>}
        </TableBody>
      </Table>
    </>
  );
}
