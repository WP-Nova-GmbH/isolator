import { api, apiResponse } from '@/lib/api';

export interface StoredFile {
  id: string;
  name: string;
  size: number;
}

export function uploadFile(file: File) {
  const body = new FormData();
  body.set('file', file);
  return api<StoredFile>('/files', { method: 'POST', body });
}

/**
 * Uploads what a form's file field holds, then saves the record that links to it. An upload whose
 * record is refused is removed again, so nothing is left behind.
 */
export async function withUpload<T>(
  chosen: FormDataEntryValue | null,
  save: (upload: { stored: StoredFile | null; file: File | null }) => Promise<T>,
) {
  const file = chosen instanceof File && chosen.name ? chosen : null;
  const stored = file ? await uploadFile(file) : null;
  try {
    return await save({ stored, file });
  } catch (error) {
    if (stored) await api(`/files/${stored.id}`, { method: 'DELETE' });
    throw error;
  }
}

/** Fetches through the API so the Member is checked, then hands the browser the file. */
export async function downloadFile({ id, name }: { id: string; name: string }) {
  const response = await apiResponse(`/files/${id}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
