import { api, apiResponse } from '@/lib/api';

export function signIn(email: FormDataEntryValue | null, password: FormDataEntryValue | null) {
  return apiResponse('/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
    signedOut: true,
  });
}

export function signOut() {
  return apiResponse('/auth/sign-out', { method: 'POST', body: {}, signedOut: true });
}

export function changePassword(form: FormData) {
  return api('/auth/change-password', {
    method: 'POST',
    body: {
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
      revokeOtherSessions: true,
    },
  });
}

/** The link someone opens to accept an invitation. Whoever has it can use it. */
export function invitationLink(token: string) {
  return `${window.location.origin}/invite/${token}`;
}
