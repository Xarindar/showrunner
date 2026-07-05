"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { optionalEmailStored, optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { defaultTemplateRepository, parseTemplateRepository } from "@/lib/deployments/github";
import { moduleIncludeValue, normalizeDeploymentModules } from "@/lib/deployments/modules";
import { deploymentTokenPreview, generateDeploymentToken, hashDeploymentToken } from "@/lib/deployments/tokens";
import { prisma } from "@/lib/prisma";
import { resolveCurrentSite } from "@/lib/site";

const fallbackPath = "/admin/modules/deployments";
const maxInviteHours = 24 * 30;
const repoNamePattern = /^[A-Za-z0-9._-]{1,100}$/;
const repoOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const createDeploymentFormSchema = z.object({
  clientEmail: optionalEmailStored,
  clientName: requiredText,
  expiresInHours: z.coerce.number().int().min(1).max(maxInviteHours).catch(72),
  repoName: optionalStoredText.refine((value) => value === "" || repoNamePattern.test(value), "Use letters, numbers, dots, dashes, or underscores."),
  repoOwner: optionalStoredText.refine((value) => value === "" || repoOwnerPattern.test(value), "Use a valid GitHub user or organization name."),
  templateRepository: optionalStoredText
});

const deploymentIdFormSchema = z.object({
  id: requiredText
});

const regenerateDeploymentFormSchema = deploymentIdFormSchema.extend({
  expiresInHours: z.coerce.number().int().min(1).max(maxInviteHours).catch(72)
});

function deploymentRedirect(params: Record<string, string>): never {
  const target = new URL(fallbackPath, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  redirect(`${target.pathname}${target.search}`);
}

function redirectError(message: string): never {
  deploymentRedirect({ error: message });
}

function slugifyRepoName(value: string) {
  const repoName = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return repoName || `showrunner-${Date.now()}`;
}

function expiresAtFromHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function redirectWithInvite(saved: string, deploymentId: string, token: string): never {
  deploymentRedirect({
    created: deploymentId,
    saved,
    token
  });
}

export async function createClientDeploymentAction(formData: FormData) {
  const actor = await requireAdmin("deployments:manage");
  const input = await parseForm(createDeploymentFormSchema, formData, fallbackPath);
  const selectedModules = normalizeDeploymentModules(formData.getAll("modules").map(String));
  const template = parseTemplateRepository(input.templateRepository || defaultTemplateRepository());
  const repoName = input.repoName || slugifyRepoName(input.clientName);

  if (!selectedModules.length) {
    redirectError("Choose at least one client module for this deployment.");
  }

  if (!template) {
    redirectError("Add a GitHub template repository as owner/repo or https://github.com/owner/repo.");
  }

  if (!repoNamePattern.test(repoName)) {
    redirectError("Use a GitHub-safe repository name.");
  }

  const site = await resolveCurrentSite();
  const token = generateDeploymentToken();
  const tokenHash = hashDeploymentToken(token);
  const moduleInclude = moduleIncludeValue(selectedModules);
  const deployment = await prisma.clientDeployment.create({
    data: {
      clientEmail: input.clientEmail,
      clientName: input.clientName,
      createdById: actor.id,
      expiresAt: expiresAtFromHours(input.expiresInHours),
      inviteTokenHash: tokenHash,
      inviteTokenPreview: deploymentTokenPreview(token),
      moduleInclude,
      repoName,
      repoOwner: input.repoOwner,
      selectedModules,
      siteId: site.id,
      templateRepository: template.value
    },
    select: {
      id: true
    }
  });

  await recordAuditLog({
    action: "client_deployment.created",
    actor,
    metadata: {
      clientEmail: input.clientEmail,
      expiresInHours: input.expiresInHours,
      moduleInclude,
      repoOwner: input.repoOwner,
      repoName,
      selectedModules,
      templateRepository: template.value
    },
    siteId: site.id,
    targetId: deployment.id,
    targetLabel: input.clientName,
    targetType: "client_deployment"
  });

  revalidatePath(fallbackPath);
  redirectWithInvite("created", deployment.id, token);
}

export async function regenerateClientDeploymentInviteAction(formData: FormData) {
  const actor = await requireAdmin("deployments:manage");
  const input = await parseForm(regenerateDeploymentFormSchema, formData, fallbackPath);
  const site = await resolveCurrentSite();
  const existing = await prisma.clientDeployment.findFirst({
    select: { clientName: true, id: true, status: true },
    where: { id: input.id, siteId: site.id }
  });

  if (!existing) {
    redirectError("Deployment record not found.");
  }

  if (existing.status === "CLAIMED") {
    redirectError("Claimed deployments already have a GitHub repository.");
  }

  const token = generateDeploymentToken();
  const tokenHash = hashDeploymentToken(token);

  await prisma.clientDeployment.update({
    data: {
      expiresAt: expiresAtFromHours(input.expiresInHours),
      failureReason: "",
      inviteTokenHash: tokenHash,
      inviteTokenPreview: deploymentTokenPreview(token),
      revokedAt: null,
      status: "READY"
    },
    where: { id: existing.id }
  });

  await recordAuditLog({
    action: "client_deployment.invite_regenerated",
    actor,
    metadata: { expiresInHours: input.expiresInHours },
    siteId: site.id,
    targetId: existing.id,
    targetLabel: existing.clientName,
    targetType: "client_deployment"
  });

  revalidatePath(fallbackPath);
  redirectWithInvite("regenerated", existing.id, token);
}

export async function revokeClientDeploymentInviteAction(formData: FormData) {
  const actor = await requireAdmin("deployments:manage");
  const input = await parseForm(deploymentIdFormSchema, formData, fallbackPath);
  const site = await resolveCurrentSite();
  const existing = await prisma.clientDeployment.findFirst({
    select: { clientName: true, id: true, status: true },
    where: { id: input.id, siteId: site.id }
  });

  if (!existing) {
    redirectError("Deployment record not found.");
  }

  if (existing.status === "CLAIMED") {
    redirectError("Claimed deployments cannot be revoked from here.");
  }

  await prisma.clientDeployment.update({
    data: {
      revokedAt: new Date(),
      status: "REVOKED"
    },
    where: { id: existing.id }
  });

  await recordAuditLog({
    action: "client_deployment.invite_revoked",
    actor,
    siteId: site.id,
    targetId: existing.id,
    targetLabel: existing.clientName,
    targetType: "client_deployment"
  });

  revalidatePath(fallbackPath);
  deploymentRedirect({ saved: "revoked" });
}
