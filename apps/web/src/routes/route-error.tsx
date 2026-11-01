import { useRouteError } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { TextLink } from '@/components/table-parts';
import { ApiError } from '@/lib/api';
import { NotFound } from './not-found';

/** What a page shows when its data doesn't load. */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  if (error instanceof ApiError && error.status === 404) return <NotFound />;

  const content = (
    <>
      <PageHeader
        title="This page didn't load"
        description="Isolator couldn't reach its API. Check that the API and database are running, then try again."
      />
      {!fullPage && (
        <TextLink to="/" className="self-start">
          Go to Overview
        </TextLink>
      )}
    </>
  );
  if (!fullPage) return content;
  return <main className="flex min-h-svh flex-col gap-6 bg-background p-9">{content}</main>;
}
