import { describe, expect, it } from 'vitest';
import { resolveHomeDestination } from './home-destination';

describe('resolveHomeDestination', () => {
  it('renders the landing when signed out', () => {
    expect(
      resolveHomeDestination({
        signedIn: false,
        organizationId: null,
        pendingInvitationId: null,
      }),
    ).toBeNull();
  });

  it('goes to the dashboard when the user has an organization', () => {
    expect(
      resolveHomeDestination({
        signedIn: true,
        organizationId: 'org_1',
        pendingInvitationId: 'inv_1',
      }),
    ).toBe('/dashboard');
  });

  it('goes to the pending invitation when there is no organization', () => {
    expect(
      resolveHomeDestination({
        signedIn: true,
        organizationId: null,
        pendingInvitationId: 'inv_1',
      }),
    ).toBe('/accept-invitation/inv_1');
  });

  it('goes to onboarding when there is no organization and no invitation', () => {
    expect(
      resolveHomeDestination({
        signedIn: true,
        organizationId: null,
        pendingInvitationId: null,
      }),
    ).toBe('/onboarding');
  });
});
