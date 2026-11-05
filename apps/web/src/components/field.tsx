import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface FieldProps {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-4">
      {children}
    </div>
  );
}

/** Set by FormDialog, so a record's fields drop their cards inside a dialog. */
export const InDialog = createContext(false);

interface FieldSectionProps {
  /** Shown as a heading. */
  title?: string;
  /** Names the section for screen readers when it has no title. */
  label?: string;
  /** Beside the title, such as a live score. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A group of a record's fields: a card on a page, a plain group inside a dialog. */
export function FieldSection({ title, label, aside, className, children }: FieldSectionProps) {
  const inDialog = useContext(InDialog);
  const Heading = inDialog ? 'h3' : 'h2';
  const content = (
    <>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <Heading>{title}</Heading>
          {aside}
        </div>
      )}
      {children}
    </>
  );
  const classes = cn('flex flex-col gap-4', className);

  if (inDialog) {
    return (
      <section aria-label={label ?? title} className={classes}>
        {content}
      </section>
    );
  }
  return (
    <Card aria-label={label ?? title} className={classes}>
      {content}
    </Card>
  );
}
