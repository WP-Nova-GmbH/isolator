import { useEffect, useState } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Control {
  id: string;
  ref: string;
  title: string;
  theme: string;
}

export function Controls() {
  const [controls, setControls] = useState<Control[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/controls')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then(setControls)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Annex A controls</h1>
      {error && (
        <Alert variant="destructive" className="mt-6">
          <CircleAlertIcon />
          <AlertTitle>Controls didn't load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!controls && !error && (
        <div className="mt-6 flex flex-col gap-2" aria-label="Loading controls">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      )}
      {controls && (
        <div className="mt-6 rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Theme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {controls.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-muted-foreground">{c.ref}</TableCell>
                  <TableCell>{c.title}</TableCell>
                  <TableCell className="capitalize">{c.theme}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
