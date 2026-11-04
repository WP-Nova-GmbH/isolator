import { useState } from 'react';
import { XIcon } from 'lucide-react';
import {
  Link,
  Outlet,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useLocation,
  useOutletContext,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { DetailLayout } from '@/components/detail-layout';
import { DownloadButton } from '@/components/download-button';
import { Fact, Facts } from '@/components/facts';
import { Field, FieldGrid } from '@/components/field';
import { EditDialog, FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { LifecycleMenu, type LifecycleAction } from '@/components/lifecycle-menu';
import { LinkedItem, LinkPicker } from '@/components/link-picker';
import { NewTaskForm } from '@/components/new-task-form';
import { UNASSIGNED, UNKNOWN, yesNoLabel } from '@/components/owner-select';
import { PageHeader } from '@/components/page-header';
import { RiskScore } from '@/components/risk-score';
import { StateBadge } from '@/components/state-badge';
import { SupplierFields } from '@/components/supplier-fields';
import { TabNav } from '@/components/tab-nav';
import { DataCell, EmptyRow, MainCell, Ref } from '@/components/table-parts';
import { TasksTable } from '@/components/tasks-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import { usePermissions } from '@/lib/members';
import type { Asset } from '@/lib/assets';
import { aYearFromNow, todayIso } from '@/lib/dates';
import { withUpload } from '@/lib/files';
import { currentScore, toTask, type ApiTask } from '@/lib/risks';
import {
  contractTermLabels,
  criticalityLabels,
  fileKindLabels,
  reviewOutcomeLabels,
  supplierPayload,
  type SupplierDetail as Supplier,
  type SupplierFile,
} from '@/lib/suppliers';
import { taskIntent, type Task } from '@/lib/tasks';
import { useFormFetcher } from '@/lib/use-form-fetcher';

export async function supplierDetailLoader({ params }: LoaderFunctionArgs) {
  const [supplier, tasks, assets] = await Promise.all([
    api<Supplier>(`/suppliers/${params.ref}`),
    api<ApiTask[]>(`/tasks?supplier=${params.ref}`),
    api<Asset[]>('/assets'),
  ]);
  return { supplier, tasks: tasks.map(toTask), assets };
}

function addFile(path: string, form: FormData) {
  return withUpload(form.get('upload'), ({ stored, file }) =>
    api(`${path}/files`, {
      method: 'POST',
      body: {
        kind: form.get('kind'),
        title: form.get('title') || file?.name,
        location: form.get('location') || null,
        storedFileId: stored?.id ?? null,
        datedOn: form.get('datedOn') || null,
        expiresOn: form.get('expiresOn') || null,
      },
    }),
  );
}

export async function supplierDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/suppliers/${params.ref}`;
  const id = form.get('id');
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/suppliers');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: supplierPayload(form) });
      case 'end':
        return api(`${path}/ending`, { method: 'POST', body: { reason } });
      case 'resume':
        return api(`${path}/resumption`, { method: 'POST', body: { reason } });
      case 'add-review':
        return api(`${path}/reviews`, {
          method: 'POST',
          body: {
            reviewedOn: form.get('reviewedOn'),
            outcome: form.get('outcome'),
            notes: form.get('notes'),
            nextReviewOn: form.get('nextReviewOn'),
          },
        });
      case 'add-file':
        return addFile(path, form);
      case 'remove-file':
        return api(`${path}/files/${id}`, { method: 'DELETE' });
      case 'link-asset':
        return api(`${path}/assets`, { method: 'POST', body: { id } });
      case 'unlink-asset':
        return api(`${path}/assets/${id}`, { method: 'DELETE' });
      default:
        return taskIntent(form, { supplierRef: params.ref });
    }
  });
}

function lifecycleProps(supplier: Supplier) {
  if (supplier.endedAt) {
    return {
      title: 'Ended Supplier',
      text: 'Resume this Supplier if it serves you again.',
      actions: [
        {
          intent: 'resume',
          label: 'Resume Supplier',
          prompt: 'Why does this Supplier serve you again?',
        },
      ],
    };
  }
  const actions: LifecycleAction[] = [
    { intent: 'end', label: 'End Supplier', prompt: 'Why has this relationship ended?' },
  ];
  const onRecord = supplier.reviews.length + supplier.files.length > 0;
  if (!onRecord) {
    actions.push({
      intent: 'delete',
      label: 'Delete Supplier',
      prompt: 'Why was this entered by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'End or delete',
    text: onRecord
      ? 'End this Supplier when they stop serving you. Reviews and files keep it on record, so it can’t be deleted.'
      : 'End this Supplier when they stop serving you. Delete it if it was entered by mistake.',
    actions,
  };
}

function FileLocation({ file }: { file: SupplierFile }) {
  const { location, upload } = file;
  return (
    <div className="flex flex-col items-start gap-0.5">
      {upload && <DownloadButton file={upload} />}
      {location &&
        (/^https?:\/\//i.test(location) ? (
          <a href={location} target="_blank" rel="noreferrer" className="text-link hover:underline">
            {location}
          </a>
        ) : (
          location
        ))}
    </div>
  );
}

function RemoveFile({ file }: { file: SupplierFile }) {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={file.id} />
      <Button
        type="submit"
        name="intent"
        value="remove-file"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${file.title}`}
      >
        <XIcon />
      </Button>
    </fetcher.Form>
  );
}

function FileForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title="Add a file" size="lg" onClose={onClose}>
      <fetcher.Form method="post" encType="multipart/form-data" className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <FieldGrid>
            <Field label="Kind" htmlFor="file-kind">
              <NativeSelect id="file-kind" name="kind">
                {Object.entries(fileKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Name, if not the file's own" htmlFor="file-title">
              <Input id="file-title" name="title" autoFocus />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Upload, up to 25 MB" htmlFor="file-upload">
              <Input id="file-upload" name="upload" type="file" className="py-1.5" />
            </Field>
            <Field label="Or where it is kept: a link or a folder" htmlFor="file-location">
              <Input id="file-location" name="location" />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Dated, if known" htmlFor="file-dated">
              <Input id="file-dated" name="datedOn" type="date" />
            </Field>
            <Field label="Expires, if it does" htmlFor="file-expires">
              <Input id="file-expires" name="expiresOn" type="date" />
            </Field>
          </FieldGrid>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value="add-file"
            disabled={fetcher.state !== 'idle'}
          >
            Add file
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

function ReviewForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title="Record a review" size="lg" onClose={onClose}>
      <fetcher.Form method="post" className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <FieldGrid>
            <Field label="Reviewed on" htmlFor="review-date">
              <Input
                id="review-date"
                name="reviewedOn"
                type="date"
                max={todayIso()}
                defaultValue={todayIso()}
                required
              />
            </Field>
            <Field label="Outcome" htmlFor="review-outcome">
              <NativeSelect id="review-outcome" name="outcome">
                {Object.entries(reviewOutcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Next review" htmlFor="review-next">
              <Input
                id="review-next"
                name="nextReviewOn"
                type="date"
                defaultValue={aYearFromNow()}
                required
              />
            </Field>
          </FieldGrid>
          <Field label="What you checked and what you found" htmlFor="review-notes">
            <Textarea id="review-notes" name="notes" required autoFocus />
          </Field>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value="add-review"
            disabled={fetcher.state !== 'idle'}
          >
            Record review
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

/** "Ends on 2026-12-31", "Rolls on until notice", or null while nobody knows. */
function contractFact(supplier: Supplier) {
  if (supplier.contractTerm === 'fixed') return `Ends on ${supplier.contractEnds}`;
  return supplier.contractTerm && contractTermLabels[supplier.contractTerm];
}

interface SupplierTabContext {
  supplier: Supplier;
  tasks: Task[];
  ended: boolean;
  locked: boolean;
}

/** The Supplier's page: header, facts, and tabs whose content is the child route. */
export function SupplierDetail() {
  const { supplier, tasks, assets } = useLoaderData<typeof supplierDetailLoader>();
  const result = useActionData<typeof supplierDetailAction>();
  const { pathname } = useLocation();
  const [adding, setAdding] = useState<'file' | 'review' | 'task' | null>(null);
  const ended = supplier.endedAt !== null;
  const { canEdit } = usePermissions();
  const locked = ended || !canEdit;
  const close = () => setAdding(null);

  // Each tab is a route of its own, so it can be linked to and reached with Back.
  const base = `/suppliers/${supplier.ref}`;
  const tabs = [
    { key: 'files', to: base, label: 'Files', count: supplier.files.length },
    { key: 'reviews', to: `${base}/reviews`, label: 'Reviews', count: supplier.reviews.length },
    { key: 'tasks', to: `${base}/tasks`, label: 'Tasks', count: tasks.length },
    { key: 'assets', to: `${base}/assets`, label: 'Assets', count: supplier.assets.length },
  ] as const;
  const current = tabs.find((tab) => tab.to === pathname.replace(/\/$/, '')) ?? tabs[0];

  // The open tab's own action sits beside the tabs.
  const tabAction = {
    files: !locked && (
      <Button type="button" variant="outline" onClick={() => setAdding('file')}>
        Add file
      </Button>
    ),
    reviews: !locked && (
      <Button type="button" variant="outline" onClick={() => setAdding('review')}>
        Record review
      </Button>
    ),
    tasks: !locked && (
      <Button type="button" variant="outline" onClick={() => setAdding('task')}>
        New Task
      </Button>
    ),
    assets: !ended && (
      <LinkPicker
        label="Link asset"
        intent="link-asset"
        options={assets
          .filter((asset) => !asset.supplier)
          .map((asset) => ({ id: asset.id, label: asset.name }))}
      />
    ),
  }[current.key];

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={supplier.provides || undefined}
        eyebrow={<Ref>{supplier.ref}</Ref>}
        back={{ to: '/suppliers', label: 'Suppliers' }}
        actions={
          <>
            <StateBadge kind="supplier" state={supplier.state} />
            {!locked && (
              <EditDialog title="Edit Supplier">
                <SupplierFields supplier={supplier} />
              </EditDialog>
            )}
            <LifecycleMenu {...lifecycleProps(supplier)} />
          </>
        }
      />
      <FormError message={result?.error} />
      {ended && (
        <Alert>
          <AlertTitle>Ended on {supplier.endedAt?.slice(0, 10)}</AlertTitle>
          <AlertDescription>{supplier.endedReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            {!ended && (
              <Card aria-label="Needs attention" className="flex flex-col gap-3">
                <h2>Needs attention</h2>
                {supplier.attention.length > 0 ? (
                  <ul className="flex list-disc flex-col gap-1.5 pl-4">
                    {supplier.attention.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Everything is in order.</p>
                )}
              </Card>
            )}
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(supplier.history)} />
            </Card>
          </>
        }
      >
        <section aria-label="Details">
          <Facts>
            <Fact label="Owner" empty={UNASSIGNED}>
              {supplier.ownerName}
            </Fact>
            <Fact label="Criticality" empty={UNKNOWN}>
              {supplier.criticality && criticalityLabels[supplier.criticality]}
            </Fact>
            <Fact label="Handles personal data" empty={UNKNOWN}>
              {yesNoLabel(supplier.handlesPersonalData)}
            </Fact>
            <Fact label="Next review">{supplier.nextReviewOn}</Fact>
            <Fact label="Contract" empty={UNKNOWN}>
              {contractFact(supplier)}
            </Fact>
            <Fact label="Security contact">{supplier.contact}</Fact>
            <Fact label="Exit plan" empty="None yet" wide>
              {supplier.exitPlan}
            </Fact>
          </Facts>
        </section>

        <section aria-label={current.label} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabNav
              label="What is on record for this Supplier"
              items={tabs.map((tab) => ({ ...tab, active: tab === current }))}
            />
            {tabAction}
          </div>
          <Outlet context={{ supplier, tasks, ended, locked } satisfies SupplierTabContext} />
        </section>
      </DetailLayout>

      {adding === 'file' && <FileForm onClose={close} />}
      {adding === 'review' && <ReviewForm onClose={close} />}
      {adding === 'task' && <NewTaskForm onClose={close} />}
    </>
  );
}

/** The index tab: contracts, certificates and other paperwork. */
export function SupplierFiles() {
  const { supplier, locked } = useOutletContext<SupplierTabContext>();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Where it is kept</TableHead>
          <TableHead>Dated</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>State</TableHead>
          {!locked && <TableHead className="sr-only">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {supplier.files.map((file) => (
          <TableRow key={file.id}>
            <TableCell className="min-w-44 whitespace-normal">
              <div className="font-medium">{file.title}</div>
              <div className="text-xs text-muted-foreground">{fileKindLabels[file.kind]}</div>
            </TableCell>
            <DataCell className="min-w-44 whitespace-normal">
              <FileLocation file={file} />
            </DataCell>
            <DataCell>{file.datedOn ?? UNKNOWN}</DataCell>
            <DataCell>{file.expiresOn ?? 'None'}</DataCell>
            <TableCell>
              <StateBadge kind="evidence" state={file.state} />
            </TableCell>
            {!locked && (
              <TableCell className="py-0">
                <RemoveFile file={file} />
              </TableCell>
            )}
          </TableRow>
        ))}
        {supplier.files.length === 0 && (
          <EmptyRow colSpan={6}>No contracts or certificates on file yet.</EmptyRow>
        )}
      </TableBody>
    </Table>
  );
}

export function SupplierReviews() {
  const { supplier } = useOutletContext<SupplierTabContext>();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Reviewed by</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {supplier.reviews.map((review) => (
          <TableRow key={review.id}>
            <DataCell>{review.reviewedOn}</DataCell>
            <TableCell>{review.reviewerName}</TableCell>
            <TableCell>
              <StateBadge kind="supplierReview" state={reviewOutcomeLabels[review.outcome]} />
            </TableCell>
            <MainCell>{review.notes}</MainCell>
          </TableRow>
        ))}
        {supplier.reviews.length === 0 && <EmptyRow colSpan={4}>No reviews yet.</EmptyRow>}
      </TableBody>
    </Table>
  );
}

/** Marking a Task done posts to this route, so its refusal shows here. */
export function SupplierTasks() {
  const { tasks, ended } = useOutletContext<SupplierTabContext>();
  const result = useActionData<typeof supplierDetailAction>();

  return (
    <>
      <FormError message={result?.error} />
      <TasksTable tasks={tasks} canFinish={!ended} emptyText="No Tasks yet." />
    </>
  );
}

export function SupplierAssets() {
  const { supplier, ended } = useOutletContext<SupplierTabContext>();

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-x-8 gap-y-6">
      <section aria-label="Assets they provide" className="flex flex-col gap-2">
        <h3>Assets they provide</h3>
        {supplier.assets.map((asset) => (
          <LinkedItem
            key={asset.id}
            id={asset.id}
            intent="unlink-asset"
            label={asset.name}
            locked={ended}
          >
            {asset.name}
          </LinkedItem>
        ))}
        {supplier.assets.length === 0 && (
          <p className="text-muted-foreground">No assets linked yet.</p>
        )}
      </section>
      <section aria-label="Risks through those assets" className="flex flex-col gap-2">
        <h3>Risks through those assets</h3>
        {supplier.risks.map((risk) => (
          <div key={risk.ref} className="flex items-center justify-between gap-2">
            <Link to={`/risks/${risk.ref}`} className="min-w-0 hover:underline">
              {risk.title}
            </Link>
            <RiskScore {...currentScore(risk)} />
          </div>
        ))}
        {supplier.risks.length === 0 && (
          <p className="text-muted-foreground">No open risks touch these assets.</p>
        )}
      </section>
    </div>
  );
}
