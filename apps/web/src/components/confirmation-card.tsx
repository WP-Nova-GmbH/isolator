import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ConfirmationCardProps {
  text: string;
  /** Button label. Left out once the record is confirmed. */
  action?: string;
  disabled?: boolean;
  /** Submits this form with intent=confirm, so what is on screen is what gets confirmed. */
  form?: string;
}

export function ConfirmationCard({ text, action, disabled, form }: ConfirmationCardProps) {
  return (
    <Card aria-label="Confirmation" className="flex flex-col gap-3">
      <h2>Confirmation</h2>
      <p className="text-muted-foreground">{text}</p>
      {action && (
        <Button
          type={form ? 'submit' : 'button'}
          form={form}
          name={form && 'intent'}
          value={form && 'confirm'}
          disabled={disabled}
        >
          {action}
        </Button>
      )}
    </Card>
  );
}
