import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const cookieName = "admin_session";
const devSecret = "dev-secret-change-before-deploying";
const dummyPasswordHash = bcrypt.hashSync("not-the-admin-password", 12);
const loginAttempts = new Map<string, { count: number; lockedUntil?: number }>();
const maxLoginAttempts = 6;
const lockoutMs = 10 * 60 * 1000;

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

function getLoginAttemptKey(email: string) {
  return email.trim().toLowerCase();
}

function isLockedOut(email: string) {
  const attempt = loginAttempts.get(getLoginAttemptKey(email));
  return Boolean(attempt?.lockedUntil && attempt.lockedUntil > Date.now());
}

function recordLoginFailure(email: string) {
  const key = getLoginAttemptKey(email);
  const current = loginAttempts.get(key);
  const count = (current?.count || 0) + 1;

  loginAttempts.set(key, {
    count,
    lockedUntil: count >= maxLoginAttempts ? Date.now() + lockoutMs : current?.lockedUntil
  });
}

function clearLoginFailures(email: string) {
  loginAttempts.delete(getLoginAttemptKey(email));
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
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
    if (typeof userId !== "string") return null;

    return prisma.adminUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function verifyAdminLogin(email: string, password: string) {
  if (isLockedOut(email)) return null;

  const user = await prisma.adminUser.findUnique({ where: { email } });
  const passwordHash = user?.passwordHash || dummyPasswordHash;
  const valid = await bcrypt.compare(password, passwordHash);

  if (!user || !valid) {
    recordLoginFailure(email);
    return null;
  }

  clearLoginFailures(email);
  return user;
}
