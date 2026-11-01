import { Field, FieldGrid } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useAppData } from '@/lib/members';
import { useFormFetcher } from '@/lib/use-form-fetcher';
import { FormError } from './form-error';

interface NewTaskFormProps {
  /** Records to choose from. Left out on a record's own page, where the action knows the record. */
  targets?: { group: string; options: { value: string; label: string }[] }[];
  onClose: () => void;
}

/** Posts intent=add-task to the page's action. */
export function NewTaskForm({ targets, onClose }: NewTaskFormProps) {
  const { me, members } = useAppData();
  const fetcher = useFormFetcher(onClose);

  return (
    <Card aria-label="New Task">
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <FormError message={fetcher.data?.error} />
        <Field label="What needs doing" htmlFor="task-title">
          <Input id="task-title" name="title" required autoFocus />
        </Field>
        <FieldGrid>
          {targets && (
            <Field label="Belongs to" htmlFor="task-target">
              <NativeSelect id="task-target" name="target" required>
                {targets.map(({ group, options }) => (
                  <optgroup key={group} label={group}>
                    {options.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Owner" htmlFor="task-owner">
            <NativeSelect id="task-owner" name="ownerId" defaultValue={me.id}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due" htmlFor="task-due">
            <Input id="task-due" name="dueOn" type="date" required />
          </Field>
        </FieldGrid>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="add-task"
            disabled={fetcher.state !== 'idle'}
          >
            Add Task
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}
