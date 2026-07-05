import { GitBranch, RefreshCw, Rocket, ShieldOff } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { defaultTemplateRepository, getGithubOAuthConfig } from "@/lib/deployments/github";
import { getDeployableClientModules } from "@/lib/deployments/modules";
import { deploymentInviteUrl, getAppBaseUrl } from "@/lib/deployments/urls";
import { formatDateTime, stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { resolveCurrentSite } from "@/lib/site";
import { Badge, Button, ButtonAnchor, Card, EqualGrid, Feedback, Field, Input, OptionPicker, StatTile, Table } from "@/components/ui";
import { createClientDeploymentAction, regenerateClientDeploymentInviteAction, revokeClientDeploymentInviteAction } from "./actions";

export const dynamic = "force-dynamic";

type DeploymentsPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
    saved?: string;
    token?: string;
  }>;
};

const savedMessages: Record<string, string> = {
  created: "Deployment invite generated. Copy the link now; the full token will not be shown again.",
  regenerated: "Deployment invite regenerated. Copy the new link now.",
  revoked: "Deployment invite revoked."
};

const deploymentModuleGroups = [
  { id: "core-workflow", label: "Core workflow" },
  { id: "client-site", label: "Client site" },
  { id: "commerce", label: "Commerce" },
  { id: "growth", label: "Growth" },
  { id: "operations", label: "Operations" }
];

function deploymentModuleGroup(moduleId: string) {
  if (["appointments", "clients", "forms", "scheduling"].includes(moduleId)) return "core-workflow";
  if (["content", "media", "portfolio", "testimonials"].includes(moduleId)) return "client-site";
  if (["billing", "payments", "products"].includes(moduleId)) return "commerce";
  if (["analytics", "automation", "communications"].includes(moduleId)) return "growth";
  return "operations";
}

function modeLabel(value: string) {
  return value.toLowerCase().replaceAll("-", " ");
}

function effectiveStatus(status: string, expiresAt: Date, now: Date) {
  if (status === "READY" && expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return status;
}

function statusTone(status: string) {
  if (status === "CLAIMED") return "success" as const;
  if (status === "READY") return "warning" as const;
  if (status === "FAILED" || status === "REVOKED") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function repoTarget(repoOwner: string, repoName: string) {
  return repoOwner ? `${repoOwner}/${repoName}` : `client GitHub/${repoName}`;
}

export default async function DeploymentsPage({ searchParams }: DeploymentsPageProps) {
  const [actor, params, site, baseUrl] = await Promise.all([requireAdmin("deployments:manage"), searchParams, resolveCurrentSite(), getAppBaseUrl()]);
  const [deployments, deployableModules] = await Promise.all([
    prisma.clientDeployment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { siteId: site.id }
    }),
    Promise.resolve(getDeployableClientModules())
  ]);
  const now = new Date();
  const moduleLabels = new Map(deployableModules.map((module) => [module.id, module.label]));
  const freshInviteUrl = params.created && params.token ? deploymentInviteUrl(baseUrl, params.token) : "";
  const freshInvite = freshInviteUrl ? deployments.find((deployment) => deployment.id === params.created) : null;
  const githubConfigured = Boolean(getGithubOAuthConfig());
  const statuses = deployments.map((deployment) => effectiveStatus(deployment.status, deployment.expiresAt, now));
  const openCount = statuses.filter((status) => status === "READY").length;
  const claimedCount = statuses.filter((status) => status === "CLAIMED").length;
  const expiredCount = statuses.filter((status) => status === "EXPIRED").length;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Internal</p>
          <h1>Client deployments</h1>
          <p>Build a client-specific Showrunner handoff with selected modules, an expiring claim link, and a GitHub repository target.</p>
        </div>
      </header>

      {params.error ? <Feedback tone="danger">{params.error}</Feedback> : null}
      {params.saved ? <Feedback tone="success">{savedMessages[params.saved] || "Deployment updated."}</Feedback> : null}

      {freshInvite && freshInviteUrl ? (
        <Card as="section" minHeight="none" bodyClassName="form-grid">
          <div>
            <p className="eyebrow">One-time invite</p>
            <h2 className="compact-title">{freshInvite.clientName}</h2>
            <p>Send this expiring link to the client. The token is stored as a hash and cannot be recovered after this page changes.</p>
          </div>
          <div className="subpanel form-grid">
            <code>{freshInviteUrl}</code>
            <div className="ui-inline-actions">
              <ButtonAnchor href={freshInviteUrl} target="_blank" rel="noreferrer" variant="secondary">
                <GitBranch size={16} />
                Open claim page
              </ButtonAnchor>
            </div>
          </div>
        </Card>
      ) : null}

      <EqualGrid min="220px" aria-label="Deployment summary">
        <StatTile label="Invites" value={deployments.length} detail={`Created by ${actor.email}`} />
        <StatTile label="Open" value={openCount} detail="Unclaimed links that have not expired." />
        <StatTile label="Claimed" value={claimedCount} detail="Client repos generated through GitHub." />
        <StatTile label="Expired" value={expiredCount} detail="Links that need regeneration." />
      </EqualGrid>

      {!githubConfigured ? (
        <Feedback tone="danger">
          GitHub OAuth is not configured. Add `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and `DEPLOYMENT_TEMPLATE_REPOSITORY` before sending live links.
        </Feedback>
      ) : null}

      <Card action={createClientDeploymentAction} as="form" minHeight="none" bodyClassName="form-grid">
        <div>
          <p className="eyebrow">New deployment</p>
          <h2 className="compact-title">Generate client invite</h2>
        </div>

        <EqualGrid>
          <Field label="Client name" htmlFor="clientName">
            <Input id="clientName" name="clientName" required />
          </Field>
          <Field label="Client email" htmlFor="clientEmail" hint="Optional; stored for your deployment record.">
            <Input id="clientEmail" name="clientEmail" type="email" />
          </Field>
        </EqualGrid>

        <EqualGrid>
          <Field label="Template repository" htmlFor="templateRepository" hint="Use owner/repo or a GitHub repo URL.">
            <Input id="templateRepository" name="templateRepository" defaultValue={defaultTemplateRepository()} placeholder="your-org/showrunner-template" />
          </Field>
          <Field label="Invite expires in hours" htmlFor="expiresInHours">
            <Input id="expiresInHours" name="expiresInHours" type="number" min={1} max={720} defaultValue={72} required />
          </Field>
        </EqualGrid>

        <EqualGrid>
          <Field label="Repository owner" htmlFor="repoOwner" hint="Optional; blank creates under the client's GitHub account.">
            <Input id="repoOwner" name="repoOwner" placeholder="client-org" />
          </Field>
          <Field label="Repository name" htmlFor="repoName" hint="Blank derives a GitHub-safe name from the client name.">
            <Input id="repoName" name="repoName" placeholder="client-showrunner" />
          </Field>
        </EqualGrid>

        <section className="subpanel">
          <OptionPicker
            description="Selected modules become the generated deployment's MODULE_INCL value. Dashboard, settings, users, and help stay available as required shell modules."
            groups={deploymentModuleGroups}
            legend="Client modules"
            name="modules"
            options={deployableModules.map((module) => ({
              defaultChecked: module.enabledByDefault,
              description: module.description,
              group: deploymentModuleGroup(module.id),
              label: module.label,
              meta: modeLabel(module.readiness.mode),
              value: module.id
            }))}
          />
        </section>

        <Button type="submit">
          <Rocket size={18} />
          Generate invite
        </Button>
      </Card>

      <Card as="section" minHeight="none">
        <div className="page-header compact-header">
          <div>
            <p className="eyebrow">History</p>
            <h2 className="section-title">Deployment records</h2>
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Modules</th>
              <th>Repository</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((deployment) => {
              const status = effectiveStatus(deployment.status, deployment.expiresAt, now);
              const selectedModules = stringArrayFromUnknown(deployment.selectedModules);
              const canManageInvite = status !== "CLAIMED";

              return (
                <tr key={deployment.id}>
                  <td>
                    <strong>{deployment.clientName}</strong>
                    {deployment.clientEmail ? <small>{deployment.clientEmail}</small> : null}
                  </td>
                  <td>
                    <small>{selectedModules.map((moduleId) => moduleLabels.get(moduleId) || moduleId).join(", ") || "No client modules"}</small>
                    <small>MODULE_INCL={deployment.moduleInclude || "required only"}</small>
                  </td>
                  <td>
                    {deployment.githubRepositoryUrl ? (
                      <a href={deployment.githubRepositoryUrl} target="_blank" rel="noreferrer">
                        {deployment.githubRepositoryUrl.replace("https://github.com/", "")}
                      </a>
                    ) : (
                      <span>{repoTarget(deployment.repoOwner, deployment.repoName)}</span>
                    )}
                    <small>Template: {deployment.templateRepository}</small>
                  </td>
                  <td>
                    <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                    {deployment.failureReason ? <small>{deployment.failureReason}</small> : null}
                    {deployment.githubUsername ? <small>Claimed by {deployment.githubUsername}</small> : null}
                  </td>
                  <td>{formatDateTime(deployment.expiresAt, "America/Chicago")}</td>
                  <td>
                    {canManageInvite ? (
                      <div className="ui-inline-actions">
                        <form action={regenerateClientDeploymentInviteAction} className="ui-inline-actions">
                          <input type="hidden" name="id" value={deployment.id} />
                          <Input aria-label="Invite expiration hours" name="expiresInHours" type="number" min={1} max={720} defaultValue={72} />
                          <Button type="submit" variant="secondary">
                            <RefreshCw size={16} />
                            Regenerate
                          </Button>
                        </form>
                        <form action={revokeClientDeploymentInviteAction} className="ui-inline-actions">
                          <input type="hidden" name="id" value={deployment.id} />
                          <Button type="submit" variant="danger">
                            <ShieldOff size={16} />
                            Revoke
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <small>Claimed {deployment.claimedAt ? formatDateTime(deployment.claimedAt, "America/Chicago") : ""}</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

