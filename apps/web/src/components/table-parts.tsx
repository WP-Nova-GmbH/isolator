import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { TableCell, TableRow } from '@/components/ui/table';

/** A control ref or record ID. */
export function Ref({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('font-mono text-[0.8125rem] text-muted-foreground tabular-nums', className)}
      {...props}
    />
  );
}

/** The column that names the record: it wraps instead of forcing the table wider. */
export const mainCell = 'min-w-60 whitespace-normal';

/** Dates, counts and "None": secondary to the record's name and state. */
export const dataCell = 'text-muted-foreground tabular-nums';

/** Long text such as a reason: it wraps, set like a data cell. */
export const noteCell = 'min-w-40 whitespace-normal text-muted-foreground';

export function MainCell({ className, ...props }: ComponentProps<typeof TableCell>) {
  return <TableCell className={cn(mainCell, className)} {...props} />;
}

export function DataCell({ className, ...props }: ComponentProps<typeof TableCell>) {
  return <TableCell className={cn(dataCell, className)} {...props} />;
}

/** A value nobody has given yet, inside a cell: "Unknown", "Unassigned", "None". */
export function NoValue({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function GroupRow({ colSpan, children }: { colSpan: number; children: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="pt-4.5 pb-1.5 text-xs font-medium text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

/** Link to a record, set in the weight of a row's main column. */
export function RecordLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn('font-medium hover:underline', className)} {...props} />;
}

/** Link that reads as a link: "Open the checklist", "Download ZIP". */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn('text-link hover:underline', className)} {...props} />;
}
