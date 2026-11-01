import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { downloadFile, formatSize, type StoredFile } from '@/lib/files';

/** Downloads an uploaded file, and says so in place if it can't. */
export function DownloadButton({ file }: { file: StoredFile }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 font-normal whitespace-normal"
        onClick={() => {
          setError(null);
          downloadFile(file).catch((failure: unknown) =>
            setError(failure instanceof ApiError ? failure.message : 'The download failed.'),
          );
        }}
      >
        {file.name} ({formatSize(file.size)})
      </Button>
      {error && <p className="text-xs text-danger-foreground">{error}</p>}
    </>
  );
}
