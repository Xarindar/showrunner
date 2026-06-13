import "server-only";

import { headers } from "next/headers";
import type { AdminRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditActor = {
  id?: string | null;
  email?: string | null;
  role?: AdminRole | null;
};

type AuditRequestContext = {
  ipAddress: string;
  userAgent: string;
};

export type AuditLogInput = {
  action: string;
  targetType: string;
  actor?: AuditActor | null;
  siteId?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Prisma.InputJsonValue;
  request?: Request;
};

function firstForwardedFor(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function auditErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function serializeAuditPayload(input: AuditLogInput, requestContext: AuditRequestContext) {
  try {
    return JSON.stringify({
      action: input.action,
      actor: input.actor || null,
      metadata: input.metadata || {},
      request: requestContext,
      siteId: input.siteId || null,
      targetId: input.targetId || "",
      targetLabel: input.targetLabel || "",
      targetType: input.targetType
    }).slice(0, 12000);
  } catch {
    return JSON.stringify({
      action: input.action,
      actorEmail: input.actor?.email || "",
      siteId: input.siteId || null,
      targetId: input.targetId || "",
      targetType: input.targetType
    });
  }
}

async function auditRequestContext(request?: Request): Promise<AuditRequestContext> {
  const source = request?.headers || (await headers());

  return {
    ipAddress: firstForwardedFor(source.get("x-forwarded-for")) || source.get("x-real-ip") || "",
    userAgent: source.get("user-agent") || ""
  };
}

export async function recordAuditLog(input: AuditLogInput) {
  const requestContext = await auditRequestContext(input.request);

  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorEmail: input.actor?.email || "",
        actorRole: input.actor?.role || null,
        actorUserId: input.actor?.id || null,
        ipAddress: requestContext.ipAddress,
        metadata: input.metadata || {},
        siteId: input.siteId || null,
        targetId: input.targetId || "",
        targetLabel: input.targetLabel || "",
        targetType: input.targetType,
        userAgent: requestContext.userAgent
      }
    });
  } catch (error) {
    const requestPayload = serializeAuditPayload(input, requestContext);
    try {
      await prisma.auditLogFailure.create({
        data: {
          action: input.action,
          actorEmail: input.actor?.email || "",
          error: auditErrorMessage(error).slice(0, 2000),
          payload: requestPayload,
          targetId: input.targetId || "",
          targetType: input.targetType
        }
      });
    } catch (fallbackError) {
      console.error("[audit:write-failed]", input.action, input.targetType, error);
      console.error("[audit:fallback-write-failed]", fallbackError);
    }
  }
}
