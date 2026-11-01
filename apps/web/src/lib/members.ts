import { redirect, useRouteLoaderData } from 'react-router';
import { api, ApiError } from '@/lib/api';

export interface CurrentMember {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  risksOwned: number;
}

export interface Invitation {
  id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
}

export async function appLoader() {
  try {
    const [me, members] = await Promise.all([
      api<CurrentMember>('/members/me'),
      api<Member[]>('/members'),
    ]);
    return { me, members };
  } catch (error) {
    // Signed in, but no Organization yet, such as an Operator who just claimed the install.
    if (error instanceof ApiError && error.status === 403) throw redirect('/organizations');
    throw error;
  }
}

/** The signed-in Member and their Organization's Members, from the app layout's loader. */
export function useAppData() {
  return useRouteLoaderData('app') as Awaited<ReturnType<typeof appLoader>>;
}
