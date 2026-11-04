import { useState, type ReactNode } from 'react';
import { InDialog } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFormFetcher } from '@/lib/use-form-fetcher';

const sizes = {
  /** A handful of fields: a reason, a file. */
  md: 'sm:max-w-md',
  /** A record's fields. */
  lg: 'sm:max-w-2xl',
  /** A Document's content. */
  xl: 'sm:max-w-4xl',
};

interface FormDialogProps {
  title: string;
  description?: string;
  size?: keyof typeof sizes;
  onClose: () => void;
  /** A form with className="contents", holding a FormDialogBody and a FormDialogFooter. */
  children: ReactNode;
}

/**
 * Every form on a page opens in one of these, so a page shows records rather than inputs. Render it
 * only while it is open: each opening starts from the record as it is now.
 */
export function FormDialog({ title, description, size = 'md', onClose, children }: FormDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={sizes[size]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* Radix warns when a dialog has no description. */}
          <DialogDescription className={cn(!description && 'sr-only')}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <InDialog.Provider value>{children}</InDialog.Provider>
      </DialogContent>
    </Dialog>
  );
}

/** The fields. Scrolls when they don't fit, keeping the title and buttons in view. */
export function FormDialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-1">
      {children}
    </div>
  );
}

interface FormDialogFooterProps {
  /** When "Cancel" would read as the action itself, as in cancelling a Task. */
  cancelLabel?: string;
  children: ReactNode;
}

/** Cancel, then the dialog's own buttons, the main one last. */
export function FormDialogFooter({ cancelLabel = 'Cancel', children }: FormDialogFooterProps) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="ghost">
          {cancelLabel}
        </Button>
      </DialogClose>
      {children}
    </DialogFooter>
  );
}

interface EditDialogProps {
  /** "Edit Supplier" */
  title: string;
  /** The button that opens it. */
  label?: string;
  size?: keyof typeof sizes;
  /** Posted to the page's action with the fields. */
  intent?: string;
  /** The record's fields. */
  children: ReactNode;
}

function EditForm({
  title,
  size,
  intent = 'save',
  onClose,
  children,
}: EditDialogProps & { onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title={title} size={size} onClose={onClose}>
      <fetcher.Form method="post" className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          {children}
        </FormDialogBody>
        <FormDialogFooter>
          <Button type="submit" name="intent" value={intent} disabled={fetcher.state !== 'idle'}>
            Save changes
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

/** The Edit button on a record's page, and the dialog it opens. */
export function EditDialog({ label = 'Edit', size = 'lg', ...props }: EditDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <EditForm size={size} {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
