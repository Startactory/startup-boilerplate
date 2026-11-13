import type { TermsAcceptanceDto } from '@/application/billing/dto';
import type {
  ReceivedInvitationDto,
  SentInvitationDto,
} from '@/application/organization/dto';

export type PersonalDataProfileDto = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalDataLinkedAccountDto = {
  providerId: string;
  accountId: string;
  linkedAt: string;
};

export type PersonalDataSessionDto = {
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type PersonalDataMembershipDto = {
  organizationId: string;
  organizationName: string;
  role: string;
  joinedAt: string;
};

export type PersonalDataExportDto = {
  exportedAt: string;
  profile: PersonalDataProfileDto;
  linkedAccounts: PersonalDataLinkedAccountDto[];
  sessions: PersonalDataSessionDto[];
  organizationMemberships: PersonalDataMembershipDto[];
  invitations: {
    sent: SentInvitationDto[];
    received: ReceivedInvitationDto[];
  };
  termsAcceptances: TermsAcceptanceDto[];
};

export type AccountDeletionOutcome = {
  deletedOrganizationCount: number;
  leftOrganizationCount: number;
};
