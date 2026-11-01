import { PageHeader } from '@/components/page-header';
import { TextLink } from '@/components/table-parts';

export function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="This page or record doesn't exist." />
      <TextLink to="/" className="self-start">
        Go to Overview
      </TextLink>
    </>
  );
}
