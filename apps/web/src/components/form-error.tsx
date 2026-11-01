import { Alert, AlertTitle } from '@/components/ui/alert';

/** Shows why the API refused what the Member just tried. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}
