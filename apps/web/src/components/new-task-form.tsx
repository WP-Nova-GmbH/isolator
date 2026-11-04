import { Field, FieldGrid } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { OwnerSelect } from '@/components/owner-select';
import { Button } from '@/components/ui/button';
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

/**
 * Posts intent=add-task to the page's action, or intent=propose-task for a Task nobody has agreed
 * to yet, which may leave its owner and due date open.
 */
export function NewTaskForm({ targets, onClose }: NewTaskFormProps) {
  const { me } = useAppData();
  const fetcher = useFormFetcher(onClose);
  const saving = fetcher.state !== 'idle';

  return (
    <FormDialog title="New Task" size="lg" onClose={onClose}>
      <fetcher.Form method="post" className="contents">
        <FormDialogBody>
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
              <OwnerSelect
                id="task-owner"
                name="ownerId"
                defaultValue={me.id}
                unassigned
                required
              />
            </Field>
            <Field label="Due" htmlFor="task-due">
              <Input id="task-due" name="dueOn" type="date" required />
            </Field>
          </FieldGrid>
          <p className="text-xs text-muted-foreground">
            Not agreed yet? Propose it. The owner and due date can wait until someone commits to it.
          </p>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value="propose-task"
            variant="outline"
            formNoValidate
            disabled={saving}
          >
            Propose Task
          </Button>
          <Button type="submit" name="intent" value="add-task" disabled={saving}>
            Add Task
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}
