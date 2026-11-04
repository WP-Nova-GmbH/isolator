import type { ReactNode } from 'react';
import { useFetcher } from 'react-router';
import { CopyLink } from '@/components/copy-link';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

interface InvitationDialogProps {
  title: string;
  /** Posted to the page's action, which answers with { link } or { error }. */
  intent: string;
  submitLabel: string;
  onClose: () => void;
  /** The fields: who to invite, and where. */
  children: ReactNode;
}

/** Creates an invitation link and shows it in place, once. */
export function InvitationDialog({
  title,
  intent,
  submitLabel,
  onClose,
  children,
}: InvitationDialogProps) {
  const fetcher = useFetcher<{ link: string } | { error: string } | null>();
  const result = fetcher.data;

  return (
    <FormDialog title={title} onClose={onClose}>
      {result && 'link' in result ? (
        <>
          <CopyLink link={result.link} />
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </>
      ) : (
        <fetcher.Form method="post" className="contents">
          <FormDialogBody>
            <FormError message={result && 'error' in result ? result.error : undefined} />
            {children}
          </FormDialogBody>
          <FormDialogFooter>
            <Button type="submit" name="intent" value={intent} disabled={fetcher.state !== 'idle'}>
              {submitLabel}
            </Button>
          </FormDialogFooter>
        </fetcher.Form>
      )}
    </FormDialog>
  );
}
