import { cn } from '@/lib/utils';

export interface HistoryItem {
  title: string;
  meta: string;
}

/** A timeline, newest first: Confirmations on a record or the versions of a Document. */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((item, index) => (
        <li key={index} className="relative flex flex-col gap-0.5 pb-3.5 pl-4.5 last:pb-0">
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1.75 left-0 size-1.75 rounded-full',
              index === 0 ? 'bg-primary' : 'bg-border-strong',
            )}
          />
          {index < items.length - 1 && (
            <span aria-hidden="true" className="absolute top-4.5 bottom-0 left-0.75 w-px bg-border" />
          )}
          <span>{item.title}</span>
          <span className="text-xs text-muted-foreground">{item.meta}</span>
        </li>
      ))}
    </ol>
  );
}
