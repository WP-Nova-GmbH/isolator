import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function Nonconformities() {
  return (
    <>
      <PageHeader
        title="Nonconformities"
        description="Where the ISMS falls short, and the Tasks that correct it."
      />
      <Alert>
        <AlertTitle>Not built yet</AlertTitle>
        <AlertDescription>
          Until it is, record a shortfall as a Task on the SoA entry or Incident it belongs to.
        </AlertDescription>
      </Alert>
    </>
  );
}
