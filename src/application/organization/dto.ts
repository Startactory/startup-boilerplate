export type OrganizationRole = 'owner' | 'admin' | 'member';

export type OrganizationMemberDto = {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: OrganizationRole;
  createdAt: string;
};

export type OrganizationInvitationDto = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: string;
  expiresAt: string;
  inviterId: string;
  createdAt: string;
};

export type UserMembershipDto = {
  organizationId: string;
  organizationName: string;
  role: string;
  joinedAt: string;
  otherMemberRoles: string[];
};

export type ReceivedInvitationDto = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type SentInvitationDto = ReceivedInvitationDto & {
  email: string;
};

export type UserInvitationsDto = {
  sent: SentInvitationDto[];
  received: ReceivedInvitationDto[];
};
