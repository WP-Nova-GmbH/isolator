import type { ReactNode } from 'react';
import { Form } from 'react-router';
import { FormError } from '@/components/form-error';
import { Logo } from '@/components/logo';

interface EntryPageProps {
  title: string;
  description?: string;
  error?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/** The pages outside the app: claiming an install, signing in, accepting an invitation. */
export function EntryPage({ title, description, error, footer, children }: EntryPageProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-100 flex-col gap-5 rounded-xl border bg-surface p-7 shadow-float">
        <Logo className="h-5.5 w-auto self-start" />
        <div>
          <h1>{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        <FormError message={error} />
        <Form method="post" className="flex flex-col gap-4">
          {children}
        </Form>
        {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
      </div>
    </main>
  );
}
