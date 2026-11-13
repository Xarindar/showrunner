import "server-only";

import { EmailCheckStatus, EmailOutboxStatus, EmailSendingDomainStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { envLooksDefault, warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings, now }) => {
  const warnings = [];
  const staleEmailCutoff = new Date(now.getTime() - 15 * 60 * 1000);

  const [failedEmailCount, staleQueuedEmailCount, verifiedSenderCount, failingSendingDomainCount, emailConnection] = await Promise.all([
    prisma.emailOutbox.count({ where: { siteId: settings.siteId, status: EmailOutboxStatus.FAILED } }),
    prisma.emailOutbox.count({ where: { siteId: settings.siteId, status: EmailOutboxStatus.QUEUED, nextAttemptAt: { lt: staleEmailCutoff } } }),
    prisma.emailSenderIdentity.count({ where: { siteId: settings.siteId, isVerified: true } }),
    prisma.emailSendingDomain.count({
      where: {
        siteId: settings.siteId,
        OR: [
          { status: EmailSendingDomainStatus.FAILED },
          { spfStatus: EmailCheckStatus.FAIL },
          { dkimStatus: EmailCheckStatus.FAIL },
          { dmarcStatus: EmailCheckStatus.FAIL }
        ]
      }
    }),
    prisma.emailProviderConnection.findUnique({ where: { siteId: settings.siteId }, select: { connectionError: true } })
  ]);

  if (!process.env.SMTP_HOST && !emailConnection) {
    warnings.push(
      warning(
        "Connect an email address",
        "Open Settings → Email to connect your own email provider before relying on customer email delivery.",
        process.env.NODE_ENV === "production" ? "critical" : "warning",
        "communications",
        "/admin/modules/settings/email"
      )
    );
  }

  if (emailConnection?.connectionError) {
    warnings.push(warning("Email provider needs attention", emailConnection.connectionError, "critical", "communications", "/admin/modules/settings/email"));
  }

  if (envLooksDefault(process.env.EMAIL_WORKER_SECRET)) {
    warnings.push(
      warning(
        "Email worker secret needs setup",
        "Set a strong EMAIL_WORKER_SECRET and provision the scheduled worker before relying on queued email delivery.",
        "warning",
        "communications",
        "/admin/modules/communications"
      )
    );
  }

  if (failedEmailCount > 0) {
    warnings.push(
      warning(
        "Failed email in outbox",
        `${failedEmailCount} email${failedEmailCount === 1 ? "" : "s"} are failed and need review.`,
        "critical",
        "communications",
        "/admin/modules/communications"
      )
    );
  }

  if (staleQueuedEmailCount > 0) {
    warnings.push(
      warning(
        "Queued email may be stuck",
        `${staleQueuedEmailCount} queued email${staleQueuedEmailCount === 1 ? "" : "s"} are past their retry time.`,
        "warning",
        "communications",
        "/admin/modules/communications"
      )
    );
  }

  if (failingSendingDomainCount > 0) {
    warnings.push(
      warning(
        "Sender domain check failed",
        `${failingSendingDomainCount} sender domain${failingSendingDomainCount === 1 ? "" : "s"} have failed SPF, DKIM, DMARC, or verification status.`,
        "warning",
        "communications",
        "/admin/modules/communications"
      )
    );
  }

  if (verifiedSenderCount === 0) {
    warnings.push(
      warning(
        "No verified sender identity",
        "Marketing email is blocked until a verified sender identity exists; transactional email may fall back to SMTP_FROM/contact email.",
        "info",
        "communications",
        "/admin/modules/communications"
      )
    );
  }

  return warnings;
};
