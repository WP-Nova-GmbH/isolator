import { useState } from 'react';
import { Field } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

interface LifecycleCardProps {
  title: string;
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
 * Closing, ending, reopening or deleting a record. Each asks why, for the Audit trail. Left out
 * for a Member whose role allows none of the actions.
 */
export function LifecycleCard({ title, text, actions: offered }: LifecycleCardProps) {
  const [chosen, setChosen] = useState<LifecycleAction | null>(null);
  const { canEdit, canConfirm } = usePermissions();
  const actions = offered.filter((action) => canEdit || (action.reviewers && canConfirm));
  if (!canEdit && actions.length === 0) return null;

  return (
    <Card aria-label={title} className="flex flex-col gap-3">
      <h2>{title}</h2>
      <p className="text-muted-foreground">{text}</p>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.intent}
              type="button"
              variant={action.destructive ? 'ghost' : 'outline'}
              onClick={() => setChosen(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      {chosen && <ReasonDialog action={chosen} onClose={() => setChosen(null)} />}
    </Card>
  );
}
