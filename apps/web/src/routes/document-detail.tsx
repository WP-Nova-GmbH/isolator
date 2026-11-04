import { useState } from 'react';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { ConfirmationCard } from '@/components/confirmation-card';
import { DetailLayout } from '@/components/detail-layout';
import { DocumentFields } from '@/components/document-fields';
import { DownloadButton } from '@/components/download-button';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { HistoryList } from '@/components/history-list';
import { LifecycleCard, type LifecycleAction } from '@/components/lifecycle-card';
import { PageHeader, SectionHeader } from '@/components/page-header';
import { StateBadge } from '@/components/state-badge';
import { Ref } from '@/components/table-parts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, attempt } from '@/lib/api';
import { historyItems } from '@/lib/audit';
import {
  documentKindLabels,
  documentPayload,
  type DocumentDetail as IsmsDocument,
} from '@/lib/documents';
import { withUpload } from '@/lib/files';
import { useFormFetcher } from '@/lib/use-form-fetcher';

export function documentDetailLoader({ params }: LoaderFunctionArgs) {
  return api<IsmsDocument>(`/documents/${params.id}`);
}

export async function documentDetailAction({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const path = `/documents/${params.id}`;
  const reason = form.get('reason');

  if (form.get('intent') === 'delete') {
    const result = await attempt(() =>
      api(`${path}/deletion`, { method: 'POST', body: { reason } }),
    );
    return result?.error ? result : redirect('/documents');
  }

  return attempt(async () => {
    switch (form.get('intent')) {
      case 'save':
        return api(path, { method: 'PUT', body: documentPayload(form) });
      case 'confirm':
        // Saves first, so what is on screen is what gets confirmed.
        await api(path, { method: 'PUT', body: documentPayload(form) });
        return api(`${path}/confirmations`, { method: 'POST' });
      case 'start-version':
        return api(`${path}/versions`, { method: 'POST' });
      case 'upload-file':
        return withUpload(form.get('upload'), ({ stored }) =>
          api(`${path}/file`, { method: 'PUT', body: { storedFileId: stored?.id ?? null } }),
        );
      case 'remove-file':
        return api(`${path}/file`, { method: 'PUT', body: { storedFileId: null } });
      case 'withdraw':
        return api(`${path}/withdrawal`, { method: 'POST', body: { reason } });
      case 'reinstate':
        return api(`${path}/reinstatement`, { method: 'POST', body: { reason } });
    }
  });
}

function confirmationProps(doc: IsmsDocument) {
  if (doc.state === 'Confirmed') {
    return {
      text: `Version ${doc.version} is in force, confirmed on ${doc.lastConfirmedAt?.slice(0, 10)}.`,
    };
  }
  return {
    text: doc.versionInForce
      ? `Version ${doc.versionInForce} stays in force until you confirm version ${doc.version}.`
      : `Version ${doc.version} takes effect when you confirm it.`,
    action: `Confirm version ${doc.version}`,
    form: 'document-form',
  };
}

function lifecycleProps(doc: IsmsDocument) {
  if (doc.withdrawnAt) {
    return {
      title: 'Withdrawn Document',
      text: 'Reinstate this Document if it applies again.',
      actions: [
        {
          intent: 'reinstate',
          label: 'Reinstate Document',
          prompt: 'Why does this Document apply again?',
        },
      ],
    };
  }
  const actions: LifecycleAction[] = [
    { intent: 'withdraw', label: 'Withdraw Document', prompt: 'Why no longer in force?' },
  ];
  if (doc.deletable) {
    actions.push({
      intent: 'delete',
      label: 'Delete Document',
      prompt: 'Why was this made by mistake?',
      destructive: true,
    });
  }
  return {
    title: 'Withdraw or delete',
    text: doc.deletable
      ? 'Withdraw this Document when it no longer applies. Delete it if it was made by mistake.'
      : 'Withdraw this Document when it no longer applies. It is on record, so it can’t be deleted.',
    actions,
  };
}

function versionItems(doc: IsmsDocument) {
  return doc.versions.map((version) => ({
    title: `Version ${version.version}, ${version.datedOn ? `dated ${version.datedOn}` : 'date unknown'}`,
    meta: [
      `Added by ${version.createdBy}, ${version.createdAt.slice(0, 10)}`,
      version.confirmedAt &&
        `Confirmed by ${version.confirmedBy}, ${version.confirmedAt.slice(0, 10)}`,
    ]
      .filter(Boolean)
      .join('. '),
  }));
}

function FileForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <fetcher.Form method="post" encType="multipart/form-data" className="flex flex-col gap-3">
      <FormError message={fetcher.data?.error} />
      <Field label="File, up to 25 MB" htmlFor="document-upload">
        <Input id="document-upload" name="upload" type="file" className="py-1.5" required />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" name="intent" value="upload-file" disabled={fetcher.state !== 'idle'}>
          Upload file
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </fetcher.Form>
  );
}

function FileCard({ doc, editable }: { doc: IsmsDocument; editable: boolean }) {
  const [uploading, setUploading] = useState(false);

  return (
    <Card aria-label="File" className="flex flex-col gap-3">
      <SectionHeader title={`File for version ${doc.version}`}>
        {editable && !uploading && (
          <Button type="button" variant="outline" onClick={() => setUploading(true)}>
            {doc.upload ? 'Replace file' : 'Upload file'}
          </Button>
        )}
      </SectionHeader>
      {uploading && <FileForm onClose={() => setUploading(false)} />}
      {doc.upload ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <DownloadButton file={doc.upload} />
          </div>
          {editable && (
            <Form method="post">
              <Button type="submit" name="intent" value="remove-file" variant="ghost" size="xs">
                Remove
              </Button>
            </Form>
          )}
        </div>
      ) : (
        !uploading && <p className="text-muted-foreground">No file for this version.</p>
      )}
    </Card>
  );
}

export function DocumentDetail() {
  const doc = useLoaderData<typeof documentDetailLoader>();
  const result = useActionData<typeof documentDetailAction>();
  const navigation = useNavigation();
  const withdrawn = doc.withdrawnAt !== null;
  const draft = doc.state === 'Draft';

  return (
    <>
      <PageHeader
        title={doc.title}
        eyebrow={
          <div className="text-muted-foreground">
            {documentKindLabels[doc.kind]}, version {doc.version}
          </div>
        }
        back={{ to: '/documents', label: 'Documents' }}
        actions={<StateBadge kind="document" state={doc.state} />}
      />
      <FormError message={result?.error} />
      {withdrawn && (
        <Alert>
          <AlertTitle>Withdrawn on {doc.withdrawnAt?.slice(0, 10)}</AlertTitle>
          <AlertDescription>{doc.withdrawnReason}</AlertDescription>
        </Alert>
      )}

      <DetailLayout
        aside={
          <>
            {!withdrawn && <ConfirmationCard {...confirmationProps(doc)} />}
            {!withdrawn && !draft && (
              <Form method="post">
                <Button
                  type="submit"
                  name="intent"
                  value="start-version"
                  variant="outline"
                  className="w-full"
                  disabled={navigation.state !== 'idle'}
                >
                  Start version {doc.version + 1}
                </Button>
              </Form>
            )}
            <Card aria-label="Versions" className="flex flex-col gap-3">
              <h2>Versions</h2>
              <HistoryList items={versionItems(doc)} />
              {doc.versions
                .filter((version) => version.upload && version.version !== doc.version)
                .map((version) => (
                  <div key={version.version} className="flex flex-col items-start gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      File of version {version.version}
                    </span>
                    <DownloadButton file={version.upload!} />
                  </div>
                ))}
            </Card>
            <Card aria-label="Used as Evidence" className="flex flex-col gap-3">
              <h2>Used as Evidence</h2>
              {doc.usedAsEvidence.map((entry) => (
                <div key={entry.ref} className="flex items-center gap-2">
                  <Ref>{entry.ref}</Ref>
                  <Link to={`/soa/${entry.ref}`} className="hover:underline">
                    {entry.title}
                  </Link>
                </div>
              ))}
              {doc.usedAsEvidence.length === 0 && (
                <p className="text-muted-foreground">Not linked to an SoA entry yet.</p>
              )}
            </Card>
            <LifecycleCard key={String(withdrawn)} {...lifecycleProps(doc)} />
            <Card aria-label="History" className="flex flex-col gap-3">
              <h2>History</h2>
              <HistoryList items={historyItems(doc.history)} />
            </Card>
          </>
        }
      >
        <Form id="document-form" method="post" className="flex flex-col gap-6">
          <fieldset disabled={withdrawn} className="contents">
            <DocumentFields key={doc.version} document={doc} contentLocked={!draft} />
          </fieldset>
          {!withdrawn && (
            <div>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="outline"
                disabled={navigation.state !== 'idle'}
              >
                Save changes
              </Button>
            </div>
          )}
        </Form>
        <FileCard doc={doc} editable={draft && !withdrawn} />
      </DetailLayout>
    </>
  );
}
