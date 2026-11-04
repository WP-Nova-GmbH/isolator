import { useState } from 'react';
import { Form } from 'react-router';
import { OwnerSelect } from '@/components/owner-select';
import { StateBadge } from '@/components/state-badge';
import { DataCell, EmptyRow, MainCell, RecordLink, Ref } from '@/components/table-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
function CommitForm({ task, onCancel }: { task: Task; onCancel: () => void }) {
  return (
    <Form method="post" preventScrollReset className="flex items-center justify-end gap-1">
      <input type="hidden" name="id" value={task.id} />
      <div className="w-40">
        <OwnerSelect
          id={`commit-owner-${task.id}`}
          name="ownerId"
          aria-label="Owner"
          defaultValue={task.ownerId ?? null}
          className="h-7"
          unassigned
          required
        />
      </div>
      <Input
        name="dueOn"
        type="date"
        aria-label="Due"
        defaultValue={task.dueOn ?? ''}
        className="h-7 w-36"
        required
      />
      <Button type="submit" name="intent" value="commit-task" size="xs">
        Commit
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
        Back
      </Button>
    </Form>
  );
}

function TaskActions({ task }: { task: Task }) {
  const [cancelling, setCancelling] = useState(false);
  const [committing, setCommitting] = useState(false);

  if (committing) return <CommitForm task={task} onCancel={() => setCommitting(false)} />;
  if (cancelling) {
    return (
      <Form method="post" preventScrollReset className="flex items-center justify-end gap-1">
        <input type="hidden" name="id" value={task.id} />
        <Input
          name="reason"
          aria-label="Why is this Task no longer needed?"
          placeholder="Why is it no longer needed?"
          className="h-7 w-56"
          required
          autoFocus
        />
        <Button type="submit" name="intent" value="cancel-task" variant="destructive" size="xs">
          Cancel Task
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => setCancelling(false)}>
          Keep
        </Button>
      </Form>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      {task.state === 'Proposed' ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => setCommitting(true)}>
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
      <Button type="button" variant="ghost" size="xs" onClick={() => setCancelling(true)}>
        Cancel
      </Button>
    </div>
  );
}

export function TasksTable({
  tasks,
  showBelongsTo = false,
  canFinish = false,
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
