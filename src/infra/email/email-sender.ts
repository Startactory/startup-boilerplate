import 'server-only';

import type { EmailSenderPort } from '@/core/email/ports/email-sender.port';
import { resendEmailAdapter } from '@/infra/external-apis/resend/resend-email-adapter';
import { smtpEmailAdapter } from '@/infra/external-apis/smtp/smtp-email-adapter';
import { env } from '@/shared/env';

export function emailSender(): EmailSenderPort {
  return env().EMAIL_PROVIDER === 'resend'
    ? resendEmailAdapter
    : smtpEmailAdapter;
}
