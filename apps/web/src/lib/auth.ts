/** The link someone opens to accept an invitation. Whoever has it can use it. */
export function invitationLink(token: string) {
  return `${window.location.origin}/invite/${token}`;
}
