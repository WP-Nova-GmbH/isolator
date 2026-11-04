import { useState, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { useFetcher } from 'react-router';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/lib/members';

interface LinkPickerProps {
  label: string;
  /** Posted to the page's action, with the chosen id. */
  intent: string;
  options: { id: string; label: string }[];
}

/** A button that opens a list of things to link to this record. */
export function LinkPicker({ label, intent, options }: LinkPickerProps) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);

  if (!usePermissions().canEdit) return null;
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        disabled={options.length === 0}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="w-48">
      <NativeSelect
        aria-label={label}
        autoFocus
        defaultValue=""
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          fetcher.submit({ intent, id: event.target.value }, { method: 'post' });
          setOpen(false);
        }}
      >
        <option value="" disabled>
          Choose
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

interface LinkedItemProps {
  id: string;
  intent: string;
  label: string;
  /** Hides the remove button, on a closed or ended record. */
  locked?: boolean;
  children: ReactNode;
}

/** A linked record with a button to remove the link. */
export function LinkedItem({ id, intent, label, locked = false, children }: LinkedItemProps) {
  const fetcher = useFetcher();
  const { canEdit } = usePermissions();

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-baseline gap-2">{children}</span>
      {!locked && canEdit && (
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            name="intent"
            value={intent}
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${label}`}
          >
            <XIcon />
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}
