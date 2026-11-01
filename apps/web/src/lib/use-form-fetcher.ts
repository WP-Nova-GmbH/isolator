import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import type { ActionResult } from '@/lib/api';

/** A fetcher for an inline form that closes itself once the page's action has saved it. */
export function useFormFetcher(onSaved: () => void) {
  const fetcher = useFetcher<ActionResult>();
  const saved = fetcher.data?.saved === true;
  const callback = useRef(onSaved);
  callback.current = onSaved;

  useEffect(() => {
    if (saved) callback.current();
  }, [saved]);

  return fetcher;
}
