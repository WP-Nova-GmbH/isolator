import type { ReactNode } from 'react';
import { ChevronLeftIcon } from 'lucide-react';
import { Link } from 'react-router';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Small line above the title, such as a control ref. */
  eyebrow?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, back, actions }: PageHeaderProps) {
  return (
    <>
      {back && (
        <Link
          to={back.to}
          className="-ml-1 flex items-center gap-0.5 self-start text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          {back.label}
        </Link>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow}
          <h1>{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    </>
  );
}

/** A section heading with an action on its right. */
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2>{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
