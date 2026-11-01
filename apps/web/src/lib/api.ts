import { redirect } from 'react-router';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ApiRequest {
  method?: string;
  /** Sent as JSON, or as it is if it's a FormData. */
  body?: unknown;
  /** For the pages outside the app: a 401 is an answer here, not a reason to go to sign-in. */
  signedOut?: boolean;
}

/** The raw response, for anything that isn't JSON. Throws ApiError on a refusal. */
export async function apiResponse(path: string, { method, body, signedOut }: ApiRequest = {}) {
  const isJson = body !== undefined && !(body instanceof FormData);
  const response = await fetch(`/api${path}`, {
    method,
    headers: isJson ? { 'content-type': 'application/json' } : undefined,
    body: isJson ? JSON.stringify(body) : (body as FormData | undefined),
  });
  if (response.status === 401 && !signedOut) throw redirect('/sign-in');
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, error?.message ?? response.statusText);
  }
  return response;
}

export async function api<T = void>(path: string, init: ApiRequest = {}): Promise<T> {
  const response = await apiResponse(path, init);
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export type ActionResult = { error?: string; saved?: boolean } | null;

/** A request's result for a page to show, for actions that also redirect or return a link. */
export async function refused<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: error.message };
    throw error;
  }
}

/** Runs an action's API calls. A refusal comes back as a message for the page to show. */
export async function attempt(run: () => Promise<unknown>): Promise<ActionResult> {
  return refused(async () => {
    await run();
    return { saved: true };
  });
}
