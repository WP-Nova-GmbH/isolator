import { useState } from 'react';
import { EllipsisIcon } from 'lucide-react';
import { Field } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/lib/members';
import { useFormFetcher } from '@/lib/use-form-fetcher';

export interface LifecycleAction {
  /** Posted to the page's action, with the reason. */
  intent: string;
  label: string;
  prompt: string;
  destructive?: boolean;
  /** A decision a Reviewer may make too, such as a risk owner closing their risk. */
  reviewers?: boolean;
}

interface LifecycleMenuProps {
  /** Names the menu for screen readers: "End or delete". */
  title: string;
  /** When to use each action, and why one may be missing. */
  text: string;
  actions: LifecycleAction[];
}

/** Deleting redirects to the register, which a fetcher follows. */
function ReasonDialog({ action, onClose }: { action: LifecycleAction; onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title={action.label} onClose={onClose}>
      <fetcher.Form method="post" className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <Field label={action.prompt} htmlFor="reason">
            <Textarea id="reason" name="reason" required autoFocus />
          </Field>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value={action.intent}
            variant={action.destructive ? 'destructive' : 'default'}
            disabled={fetcher.state !== 'idle'}
          >
            {action.label}
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

/**
 * Closing, ending, reopening or deleting a record, from the ⋯ button beside Edit: rare, so out of
 * the way. Each asks why, for the Audit trail. Left out for a Member whose role allows none of them.
 */
export function LifecycleMenu({ title, text, actions: offered }: LifecycleMenuProps) {
  const [chosen, setChosen] = useState<LifecycleAction | null>(null);
  const { canEdit, canConfirm } = usePermissions();
  const actions = offered.filter((action) => canEdit || (action.reviewers && canConfirm));
  if (actions.length === 0) return null;

  return (
    <>
      {/* Not modal, so the dialog it opens isn't left behind a locked page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={title}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label={title} className="max-w-72">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.intent}
              variant={action.destructive ? 'destructive' : 'default'}
              onSelect={() => setChosen(action)}
            >
              {action.label}…
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{text}</p>
        </DropdownMenuContent>
      </DropdownMenu>
      {chosen && <ReasonDialog action={chosen} onClose={() => setChosen(null)} />}
    </>
  );
}
