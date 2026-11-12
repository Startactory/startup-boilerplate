export function resolveHomeDestination(input: {
  signedIn: boolean;
  organizationId: string | null;
  pendingInvitationId: string | null;
}): string | null {
  if (!input.signedIn) return null;
  if (input.organizationId) return '/dashboard';
  if (input.pendingInvitationId) {
    return `/accept-invitation/${encodeURIComponent(input.pendingInvitationId)}`;
  }
  return '/onboarding';
}
