import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { type AdminRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasAdminPermission as userHasAdminPermission, type AdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { resolveCurrentSite } from "@/lib/site";

const cookieName = "admin_session";
const devSecret = "dev-secret-change-before-deploying";
const dummyPasswordHash = bcrypt.hashSync("not-the-admin-password", 12);
const maxLoginAttempts = 6;
const lockoutMs = 10 * 60 * 1000;
const loginAttemptScope = "admin_login";

export type AdminSessionUser = {
  id: string;
  tenantId: string;
  email: string;
  role: AdminRole;
};

export {
  adminPermissions,
  assertAdminCan,
  hasAdminPermission,
  type AdminPermission
} from "@/lib/admin-permissions";

export {
  applyDataScopePreset,
  dataScopeConfigFromFormData,
  dataScopePresets,
  getAccessibleBookingWhere,
  getAccessibleBookingWaitlistWhere,
  getAccessibleClientWhere,
  getAccessibleModuleWhere,
  getAccessibleFormSubmissionWhere,
  getAccessibleGalleryWhere,
  getAccessibleMediaWhere,
  getAccessibleTestimonialWhere,
  getOwnerStaffIds,
  parseDataScopeConfig,
  resolveDataScopeMode,
  scopableModules,
  type DataScopeConfig,
  type DataScopeMode,
  type DataScopePreset
} from "@/lib/data-scope";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }

  if (secret && secret.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be at least 32 characters in production.");
  }

  return new TextEncoder().encode(secret || devSecret);
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function loginAttemptKey(identifier: string, siteId: string) {
  return crypto.createHash("sha256").update(`${siteId}:${loginAttemptScope}:${identifier}`).digest("hex");
}

async function loginAttemptIdentifier(email: string) {
  const headerStore = await headers();
  const ipAddress =
    firstForwardedIp(headerStore.get("x-forwarded-for")) ||
    headerStore.get("x-real-ip")?.trim() ||
    headerStore.get("cf-connecting-ip")?.trim() ||
    "unknown";

  return `${email.trim().toLowerCase()}:${ipAddress}`;
}

async function isLockedOut(identifier: string, siteId: string) {
  const now = new Date();
  const existing = await prisma.publicRateLimit.findUnique({
    where: { siteId_key: { siteId, key: loginAttemptKey(identifier, siteId) } }
  });

  if (!existing) return false;
  if (now.getTime() - existing.windowStart.getTime() >= lockoutMs) return false;

  return existing.count >= maxLoginAttempts;
}

async function recordLoginFailure(identifier: string, siteId: string) {
  const now = new Date();
  const key = loginAttemptKey(identifier, siteId);
  const existing = await prisma.publicRateLimit.findUnique({
    where: { siteId_key: { siteId, key } }
  });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= lockoutMs) {
    await prisma.publicRateLimit.upsert({
      where: { siteId_key: { siteId, key } },
      update: {
        count: 1,
        identifier,
        scope: loginAttemptScope,
        windowStart: now
      },
      create: {
        siteId,
        key,
        scope: loginAttemptScope,
        identifier,
        count: 1,
        windowStart: now
      }
    });
    return;
  }

  await prisma.publicRateLimit.update({
    where: { siteId_key: { siteId, key } },
    data: { count: { increment: 1 } }
  });
}

async function clearLoginFailures(identifier: string, siteId: string) {
  await prisma.publicRateLimit.deleteMany({
    where: {
      siteId,
      scope: loginAttemptScope,
      identifier
    }
  });
}

export async function createSession(userId: string) {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { tenantId: true }
  });
  if (!user) throw new Error("Cannot create a session for an unknown admin user.");

  const token = await new SignJWT({ userId, tenantId: user.tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, getSecret());
    const userId = verified.payload.userId;
    const tenantId = verified.payload.tenantId;
    if (typeof userId !== "string" || typeof tenantId !== "string") return null;
    const site = await resolveCurrentSite();
    if (site.tenantId !== tenantId) return null;

    return prisma.adminUser.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, tenantId: true, email: true, role: true }
    });
  } catch {
    return null;
  }
}

export async function requireAuthenticatedAdmin() {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireAdmin(permission: AdminPermission) {
  const user = await requireAuthenticatedAdmin();
  if (!userHasAdminPermission(user, permission)) redirect("/admin?error=permission");
  return user;
}

export async function verifyAdminLogin(email: string, password: string) {
  const site = await resolveCurrentSite();
  const siteId = site.id;
  const attemptIdentifier = await loginAttemptIdentifier(email);
  if (await isLockedOut(attemptIdentifier, siteId)) return null;

  const user = await prisma.adminUser.findFirst({
    where: { email, tenantId: site.tenantId }
  });
  const passwordHash = user?.passwordHash || dummyPasswordHash;
  const valid = await bcrypt.compare(password, passwordHash);

  if (!user || !valid) {
    await recordLoginFailure(attemptIdentifier, siteId);
    return null;
  }

  await clearLoginFailures(attemptIdentifier, siteId);
  return user;
}
