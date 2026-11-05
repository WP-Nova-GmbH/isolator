import { Form, useNavigation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePermissions } from '@/lib/members';

interface ConfirmationCardProps {
  text: string;
  /** Button label. Left out once the record is confirmed. Posts intent=confirm. */
  action?: string;
  disabled?: boolean;
}

/**
 * Confirms the record as it is saved, which is what the page shows. Auditors see where the record
 * stands, without the button.
 */
export function ConfirmationCard({ text, action, disabled }: ConfirmationCardProps) {
  const { canConfirm } = usePermissions();
  const navigation = useNavigation();

  return (
    <Card aria-label="Confirmation" className="flex flex-col gap-3">
      <h2>Confirmation</h2>
      <p className="text-muted-foreground">{text}</p>
      {action && canConfirm && (
        <Form method="post" className="flex flex-col">
          <Button
            type="submit"
            name="intent"
            value="confirm"
            disabled={disabled || navigation.state !== 'idle'}
          >
            {action}
          </Button>
        </Form>
      )}
    </Card>
  );
}
