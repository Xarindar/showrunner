import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import {
  exchangeGithubCode,
  getGithubUser,
  provisionGithubRepository,
  verifyDeploymentGithubState
} from "@/lib/deployments/github";
import { normalizeDeploymentModules } from "@/lib/deployments/modules";
import { getAppBaseUrl } from "@/lib/deployments/urls";
import { stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlResponse(title: string, detail: string, status = 400) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:4rem auto;max-width:680px;padding:0 1.25rem;color:#17201f}a{color:#116466}</style></head><body><p>Showrunner deployment</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></body></html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status
    }
  );
}

async function markDeploymentFailed(deploymentId: string, tokenHash: string, reason: string) {
  await prisma.clientDeployment.updateMany({
    data: {
      failureReason: reason.slice(0, 1000),
      status: "FAILED"
    },
    where: {
      id: deploymentId,
      inviteTokenHash: tokenHash,
      status: "READY"
    }
  });
}

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return htmlResponse("GitHub sign-in was canceled", request.nextUrl.searchParams.get("error_description") || oauthError);
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  const rawState = request.nextUrl.searchParams.get("state") || "";

  if (!code || !rawState) {
    return htmlResponse("GitHub sign-in was not completed", "The authorization response was missing required data.");
  }

  let verifiedState: Awaited<ReturnType<typeof verifyDeploymentGithubState>>;
  try {
    verifiedState = await verifyDeploymentGithubState(rawState);
  } catch {
    return htmlResponse("GitHub sign-in expired", "Start again from the deployment invite link.");
  }

  const deployment = await prisma.clientDeployment.findFirst({
    where: {
      id: verifiedState.deploymentId,
      inviteTokenHash: verifiedState.tokenHash,
      revokedAt: null,
      status: "READY"
    }
  });

  if (!deployment || deployment.expiresAt.getTime() <= Date.now()) {
    return htmlResponse("Deployment link unavailable", "Ask your Showrunner contact for a fresh invite.");
  }

  try {
    const baseUrl = await getAppBaseUrl();
    const accessToken = await exchangeGithubCode(code, baseUrl);
    const githubUser = await getGithubUser(accessToken);
    const selectedModules = normalizeDeploymentModules(stringArrayFromUnknown(deployment.selectedModules));
    const repository = await provisionGithubRepository({
      accessToken,
      clientEmail: deployment.clientEmail,
      clientName: deployment.clientName,
      deploymentId: deployment.id,
      moduleInclude: deployment.moduleInclude,
      repoName: deployment.repoName,
      repoOwner: deployment.repoOwner,
      selectedModules,
      templateRepository: deployment.templateRepository
    });

    await prisma.clientDeployment.update({
      data: {
        claimedAt: new Date(),
        failureReason: "",
        githubRepositoryUrl: repository.html_url,
        githubUsername: githubUser.login,
        status: "CLAIMED"
      },
      where: { id: deployment.id }
    });

    await recordAuditLog({
      action: "client_deployment.claimed",
      metadata: {
        githubRepositoryUrl: repository.html_url,
        githubUsername: githubUser.login,
        moduleInclude: deployment.moduleInclude
      },
      siteId: deployment.siteId,
      targetId: deployment.id,
      targetLabel: deployment.clientName,
      targetType: "client_deployment"
    });

    return NextResponse.redirect(repository.html_url);
  } catch (error) {
    const message = errorMessage(error);
    await markDeploymentFailed(deployment.id, verifiedState.tokenHash, message);
    await recordAuditLog({
      action: "client_deployment.failed",
      metadata: { error: message },
      siteId: deployment.siteId,
      targetId: deployment.id,
      targetLabel: deployment.clientName,
      targetType: "client_deployment"
    });

    return htmlResponse("Repository generation failed", message, 500);
  }
}
