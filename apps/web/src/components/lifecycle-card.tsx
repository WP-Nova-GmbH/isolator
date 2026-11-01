import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export interface LifecycleAction {
  /** Posted to the page's action, with the reason. */
  intent: string;
  label: string;
  prompt: string;
  destructive?: boolean;
}

interface LifecycleCardProps {
  title: string;
  text: string;
  actions: LifecycleAction[];
}

function ReasonForm({ action, onCancel }: { action: LifecycleAction; onCancel: () => void }) {
  const navigation = useNavigation();

  return (
    <Form method="post" className="flex flex-col gap-3">
      <Field label={action.prompt} htmlFor="reason">
        <Textarea id="reason" name="reason" required autoFocus />
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          name="intent"
          value={action.intent}
          variant={action.destructive ? 'destructive' : 'default'}
          disabled={navigation.state !== 'idle'}
        >
          {action.label}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

/** Closing, ending, reopening or deleting a record. Each asks why, for the Audit trail. */
export function LifecycleCard({ title, text, actions }: LifecycleCardProps) {
  const [chosen, setChosen] = useState<LifecycleAction | null>(null);

  return (
    <Card aria-label={title} className="flex flex-col gap-3">
      <h2>{title}</h2>
      {chosen ? (
        <ReasonForm action={chosen} onCancel={() => setChosen(null)} />
      ) : (
        <>
          <p className="text-muted-foreground">{text}</p>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.intent}
                  type="button"
                  variant={action.destructive ? 'ghost' : 'outline'}
                  onClick={() => setChosen(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
