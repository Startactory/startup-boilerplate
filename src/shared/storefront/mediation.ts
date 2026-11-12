import type { LegalIdentity } from '../startup-profile/startup-profile';

export function resolveMediator(legal: LegalIdentity): string | undefined {
  const mediator = legal.company?.mediator?.trim();
  return mediator ? mediator : undefined;
}
