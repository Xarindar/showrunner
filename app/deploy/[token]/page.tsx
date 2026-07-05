import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GitBranch, Rocket } from "lucide-react";
import { githubAuthorizeUrl } from "@/lib/deployments/github";
import { getDeployableClientModules } from "@/lib/deployments/modules";
import { hashDeploymentToken } from "@/lib/deployments/tokens";
import { getAppBaseUrl } from "@/lib/deployments/urls";
import { formatDateTime, stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { Badge, ButtonAnchor, Card, EqualGrid } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim Showrunner deployment"
};

type DeploymentClaimPageProps = {
  params: Promise<{ token: string }>;
};

function ClaimShell({ children, description, title }: { children?: ReactNode; description: string; title: string }) {
  return (
    <main className="site-shell">
      <div className="ui-public-narrow stack" style={{ padding: "var(--space-8) var(--space-5)" }}>
        <header className="page-header">
          <div>
            <p className="eyebrow">Showrunner deployment</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function unavailableCopy(status: string, expired: boolean) {
  if (expired) return "This deployment link has expired.";
  if (status === "CLAIMED") return "This deployment has already been claimed.";
  if (status === "REVOKED") return "This deployment link has been revoked.";
  if (status === "FAILED") return "This deployment needs to be regenerated.";
  return "This deployment link is not available.";
}

export default async function DeploymentClaimPage({ params }: DeploymentClaimPageProps) {
  const { token } = await params;
  const tokenHash = hashDeploymentToken(token);
  const deployment = await prisma.clientDeployment.findUnique({
    where: { inviteTokenHash: tokenHash }
  });

  if (!deployment) {
    return <ClaimShell title="Link unavailable" description="This deployment invite could not be found." />;
  }

  const now = new Date();
  const expired = deployment.expiresAt.getTime() <= now.getTime();
  if (expired || deployment.status !== "READY" || deployment.revokedAt) {
    return (
      <ClaimShell title="Link unavailable" description={unavailableCopy(deployment.status, expired)}>
        <Card as="section" minHeight="none">
          <p>
            Ask your Showrunner contact for a fresh invite for <strong>{deployment.clientName}</strong>.
          </p>
        </Card>
      </ClaimShell>
    );
  }

  const baseUrl = await getAppBaseUrl();
  const authorizeUrl = await githubAuthorizeUrl({
    baseUrl,
    deploymentId: deployment.id,
    tokenHash
  });
  const moduleLabels = new Map(getDeployableClientModules().map((module) => [module.id, module.label]));
  const selectedModules = stringArrayFromUnknown(deployment.selectedModules);

  return (
    <ClaimShell
      title={`Claim ${deployment.clientName}`}
      description="Connect GitHub to create your private Showrunner repository from the prepared template."
    >
      <Card as="section" minHeight="none" bodyClassName="form-grid">
        <EqualGrid min="180px">
          <div>
            <p className="eyebrow">Repository</p>
            <h2 className="compact-title">{deployment.repoOwner ? `${deployment.repoOwner}/` : ""}{deployment.repoName}</h2>
            <p>{deployment.templateRepository}</p>
          </div>
          <div>
            <p className="eyebrow">Expires</p>
            <h2 className="compact-title">{formatDateTime(deployment.expiresAt)}</h2>
            <Badge tone="warning">Ready</Badge>
          </div>
        </EqualGrid>

        <section className="subpanel form-grid">
          <h3>Included modules</h3>
          <div className="ui-inline-actions">
            {selectedModules.map((moduleId) => (
              <Badge key={moduleId}>{moduleLabels.get(moduleId) || moduleId}</Badge>
            ))}
          </div>
          <code>MODULE_INCL={deployment.moduleInclude}</code>
        </section>

        {authorizeUrl ? (
          <ButtonAnchor href={authorizeUrl} size="lg">
            <GitBranch size={18} />
            Continue with GitHub
          </ButtonAnchor>
        ) : (
          <div className="ui-feedback ui-feedback-danger" role="alert">
            GitHub handoff is not configured for this invite yet.
          </div>
        )}
      </Card>

      <Card as="section" minHeight="none">
        <span className="dashboard-card-heading">
          <span className="dashboard-card-icon" aria-hidden="true">
            <Rocket size={18} />
          </span>
          <span>
            <strong>What happens next</strong>
            <small>GitHub will ask you to authorize repo creation, then Showrunner will generate the repository and add the deployment manifest.</small>
          </span>
        </span>
      </Card>
    </ClaimShell>
  );
}

