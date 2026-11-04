import { redirect, useRouteLoaderData } from 'react-router';
import { api, ApiError } from '@/lib/api';

export type Role = 'administrator' | 'editor' | 'reviewer' | 'auditor';

export const roleLabels: Record<Role, string> = {
  administrator: 'Administrator',
  editor: 'Editor',
  reviewer: 'Reviewer',
  auditor: 'Auditor',
};

export const roleDescriptions: Record<Role, string> = {
  administrator: 'Does everything an Editor does, and manages Members and settings.',
  editor: 'Adds and changes records, and gives Confirmations.',
  reviewer: 'Reads everything and gives Confirmations, but doesn’t change records.',
  auditor: 'Reads everything, changes nothing and owns nothing.',
};

export interface CurrentMember {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
  role: Role;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  risksOwned: number;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
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

/**
 * What the signed-in Member's role lets them do. The API decides; this only keeps the pages from
 * offering what it would refuse.
 */
export function usePermissions() {
  const { role } = useAppData().me;
  return {
    /** Add and change records. */
    canEdit: role === 'administrator' || role === 'editor',
    /** Give Confirmations, and close or reopen a risk they own. */
    canConfirm: role !== 'auditor',
    /** Manage Members and the Organization's settings. */
    canAdminister: role === 'administrator',
  };
}
