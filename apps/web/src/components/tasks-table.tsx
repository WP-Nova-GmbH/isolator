import { useState } from 'react';
import { Form } from 'react-router';
import { Field } from '@/components/field';
import { FormDialog, FormDialogBody, FormDialogFooter } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { OwnerSelect } from '@/components/owner-select';
import { StateBadge } from '@/components/state-badge';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/lib/members';
import type { Task } from '@/lib/tasks';
import { useFormFetcher } from '@/lib/use-form-fetcher';

interface TasksTableProps {
  tasks: Task[];
  /** Left out on a record's own page, where every Task belongs to that record. */
  showBelongsTo?: boolean;
  /**
   * Adds buttons that post intent=finish-task, intent=cancel-task and, for a proposed Task,
   * intent=commit-task to the page's action.
   */
  canFinish?: boolean;
  emptyText: string;
}

/** Agrees who does a proposed Task and by when. */
function CommitDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title="Commit to this Task" description={task.title} onClose={onClose}>
      <fetcher.Form method="post" preventScrollReset className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <input type="hidden" name="id" value={task.id} />
          <Field label="Owner" htmlFor={`commit-owner-${task.id}`}>
            <OwnerSelect
              id={`commit-owner-${task.id}`}
              name="ownerId"
              defaultValue={task.ownerId ?? null}
              unassigned
              required
            />
          </Field>
          <Field label="Due" htmlFor={`commit-due-${task.id}`}>
            <Input
              id={`commit-due-${task.id}`}
              name="dueOn"
              type="date"
              defaultValue={task.dueOn ?? ''}
              required
            />
          </Field>
        </FormDialogBody>
        <FormDialogFooter>
          <Button
            type="submit"
            name="intent"
            value="commit-task"
            disabled={fetcher.state !== 'idle'}
          >
            Commit
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

function CancelDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const fetcher = useFormFetcher(onClose);

  return (
    <FormDialog title="Cancel Task" description={task.title} onClose={onClose}>
      <fetcher.Form method="post" preventScrollReset className="contents">
        <FormDialogBody>
          <FormError message={fetcher.data?.error} />
          <input type="hidden" name="id" value={task.id} />
          <Field label="Why is it no longer needed?" htmlFor={`cancel-reason-${task.id}`}>
            <Textarea id={`cancel-reason-${task.id}`} name="reason" required autoFocus />
          </Field>
        </FormDialogBody>
        <FormDialogFooter cancelLabel="Keep Task">
          <Button
            type="submit"
            name="intent"
            value="cancel-task"
            variant="destructive"
            disabled={fetcher.state !== 'idle'}
          >
            Cancel Task
          </Button>
        </FormDialogFooter>
      </fetcher.Form>
    </FormDialog>
  );
}

function TaskActions({ task }: { task: Task }) {
  const [open, setOpen] = useState<'commit' | 'cancel' | null>(null);
  const close = () => setOpen(null);

  return (
    <div className="flex items-center justify-end gap-1">
      {task.state === 'Proposed' ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen('commit')}>
          Commit
        </Button>
      ) : (
        <Form method="post" preventScrollReset>
          <input type="hidden" name="id" value={task.id} />
          <Button type="submit" name="intent" value="finish-task" variant="ghost" size="xs">
            Mark done
          </Button>
        </Form>
      )}
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen('cancel')}>
        Cancel
      </Button>
      {open === 'commit' && <CommitDialog task={task} onClose={close} />}
      {open === 'cancel' && <CancelDialog task={task} onClose={close} />}
    </div>
  );
}

export function TasksTable({
  tasks,
  showBelongsTo = false,
  canFinish: open = false,
  emptyText,
}: TasksTableProps) {
  const canFinish = open && usePermissions().canEdit;
  const columns = 4 + (showBelongsTo ? 1 : 0) + (canFinish ? 1 : 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          {showBelongsTo && <TableHead>Belongs to</TableHead>}
          <TableHead>Owner</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>State</TableHead>
          {canFinish && <TableHead className="sr-only">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id ?? task.title}>
            <MainCell>
              {task.title}
              {task.cancelledReason && (
                <div className="text-xs text-muted-foreground">{task.cancelledReason}</div>
              )}
            </MainCell>
            {showBelongsTo && (
              <TableCell className="min-w-60 whitespace-normal">
                {task.belongsTo && (
                  <span className="flex items-baseline gap-2">
                    <Ref>{task.belongsTo.ref}</Ref>
                    <RecordLink to={task.belongsTo.to} className="font-normal">
                      {task.belongsTo.label}
                    </RecordLink>
                  </span>
                )}
              </TableCell>
            )}
            <TableCell>{task.owner}</TableCell>
            <DataCell>{task.due}</DataCell>
            <TableCell>
              <StateBadge kind="task" state={task.state} />
            </TableCell>
            {canFinish && (
              <TableCell className="py-0 text-right">
                {(task.state === 'Proposed' || task.state === 'Open' || task.state === 'Overdue') && (
                  <TaskActions task={task} />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
        {tasks.length === 0 && (
          <EmptyRow colSpan={columns}>{emptyText}</EmptyRow>
        )}
      </TableBody>
    </Table>
  );
}
