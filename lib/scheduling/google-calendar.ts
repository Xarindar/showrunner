import "server-only";

import crypto from "node:crypto";
import { Prisma, SchedulingCalendarConnectionStatus, SchedulingCalendarOwnerType, SchedulingCalendarProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const stateTtlSeconds = 10 * 60;
const googleFreeBusyScope = "https://www.googleapis.com/auth/calendar.freebusy";
const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleFreeBusyUrl = "https://www.googleapis.com/calendar/v3/freeBusy";
const algorithm = "aes-256-gcm";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type FreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: Array<{ end?: string; start?: string }>;
      errors?: Array<{ reason?: string }>;
    }
  >;
};

export type CalendarBusyWindow = {
  end: Date;
  ownerId: string;
  ownerType: SchedulingCalendarOwnerType;
  start: Date;
};

export type CalendarUnavailableScope = {
  message: string;
  ownerId: string;
  ownerType: SchedulingCalendarOwnerType;
};

export type CalendarBusyResult = {
  busy: CalendarBusyWindow[];
  unavailable: CalendarUnavailableScope[];
};

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function stateSecret() {
  const secret = process.env.SCHEDULING_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("SCHEDULING_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before Google Calendar onboarding can start.");
  }

  return secret || "local-dev-google-calendar-state-secret";
}

function credentialSecret() {
  const secret = process.env.SCHEDULING_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("SCHEDULING_CREDENTIAL_ENCRYPTION_KEY or AUTH_SECRET must be strong before storing scheduling calendar credentials.");
  }

  return secret || "local-dev-scheduling-calendar-credential-secret";
}

function encryptionKey() {
  return crypto.createHash("sha256").update(credentialSecret()).digest();
}

function encryptCalendarSecret(value: string) {
  const plaintext = value.trim();
  if (!plaintext) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decryptCalendarSecret(value: string) {
  if (!value) return "";
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Scheduling calendar credential payload is not recognized.");
  }

  const decipher = crypto.createDecipheriv(algorithm, encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]);

  return decrypted.toString("utf8");
}

function requireGoogleClientId() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
  if (!clientId) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is required before Google Calendar can connect.");
  return clientId;
}

function requireGoogleClientSecret() {
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
  if (!clientSecret) throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET is required before Google Calendar can connect.");
  return clientSecret;
}

function redirectUri() {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${appBaseUrl()}/api/scheduling/google-calendar/connect/callback`;
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

function ownerIdForState(ownerType: SchedulingCalendarOwnerType, ownerId?: string) {
  return ownerType === SchedulingCalendarOwnerType.STAFF ? ownerId || "" : "";
}

export function createGoogleCalendarState(input: { ownerId?: string; ownerType: SchedulingCalendarOwnerType; siteId: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + stateTtlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
      ownerId: ownerIdForState(input.ownerType, input.ownerId),
      ownerType: input.ownerType,
      siteId: input.siteId
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function verifyGoogleCalendarState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Google Calendar state is invalid.");

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Google Calendar state signature is invalid.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    exp?: number;
    ownerId?: string;
    ownerType?: SchedulingCalendarOwnerType;
    siteId?: string;
  };

  if (!decoded.siteId || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Google Calendar state has expired.");
  }
  if (decoded.ownerType !== SchedulingCalendarOwnerType.SITE && decoded.ownerType !== SchedulingCalendarOwnerType.STAFF) {
    throw new Error("Google Calendar owner scope is invalid.");
  }
  if (decoded.ownerType === SchedulingCalendarOwnerType.STAFF && !decoded.ownerId) {
    throw new Error("Google Calendar staff scope is invalid.");
  }

  return {
    ownerId: decoded.ownerType === SchedulingCalendarOwnerType.STAFF ? decoded.ownerId || "" : "",
    ownerType: decoded.ownerType,
    siteId: decoded.siteId
  };
}

export function createGoogleCalendarAuthorizeUrl(input: { ownerId?: string; ownerType: SchedulingCalendarOwnerType; siteId: string }) {
  const url = new URL(googleAuthorizeUrl);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("client_id", requireGoogleClientId());
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleFreeBusyScope);
  url.searchParams.set("state", createGoogleCalendarState(input));
  return url.toString();
}

async function googleTokenRequest(body: URLSearchParams) {
  const response = await fetch(googleTokenUrl, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  const token = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || token.error) {
    throw new Error(token.error_description || token.error || `Google token request failed with status ${response.status}.`);
  }

  return token;
}

async function exchangeAuthorizationCode(code: string) {
  return googleTokenRequest(
    new URLSearchParams({
      client_id: requireGoogleClientId(),
      client_secret: requireGoogleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri()
    })
  );
}

async function refreshAccessToken(refreshToken: string) {
  return googleTokenRequest(
    new URLSearchParams({
      client_id: requireGoogleClientId(),
      client_secret: requireGoogleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  );
}

function expiresAt(expiresIn?: number) {
  if (!expiresIn) return undefined;
  return new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000);
}

function isExpired(value: Date | null) {
  if (!value) return true;
  return value.getTime() <= Date.now() + 60 * 1000;
}

async function upsertGoogleCalendarConnection(input: {
  accessToken: string;
  expiresAt?: Date;
  ownerId: string;
  ownerType: SchedulingCalendarOwnerType;
  refreshToken?: string;
  scope?: string;
  siteId: string;
}) {
  return prisma.schedulingCalendarConnection.upsert({
    where: {
      siteId_provider_ownerType_ownerId: {
        ownerId: input.ownerId,
        ownerType: input.ownerType,
        provider: SchedulingCalendarProvider.GOOGLE,
        siteId: input.siteId
      }
    },
    update: {
      calendarId: "primary",
      connectedAt: new Date(),
      displayName: input.ownerType === SchedulingCalendarOwnerType.STAFF ? "Staff Google Calendar" : "Business Google Calendar",
      encryptedAccessToken: encryptCalendarSecret(input.accessToken),
      encryptedRefreshToken: input.refreshToken ? encryptCalendarSecret(input.refreshToken) : undefined,
      expiresAt: input.expiresAt,
      lastError: "",
      lastVerifiedAt: new Date(),
      scope: input.scope || "",
      status: SchedulingCalendarConnectionStatus.CONNECTED
    },
    create: {
      calendarId: "primary",
      connectedAt: new Date(),
      displayName: input.ownerType === SchedulingCalendarOwnerType.STAFF ? "Staff Google Calendar" : "Business Google Calendar",
      encryptedAccessToken: encryptCalendarSecret(input.accessToken),
      encryptedRefreshToken: encryptCalendarSecret(input.refreshToken || ""),
      expiresAt: input.expiresAt,
      lastVerifiedAt: new Date(),
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      provider: SchedulingCalendarProvider.GOOGLE,
      scope: input.scope || "",
      siteId: input.siteId,
      status: SchedulingCalendarConnectionStatus.CONNECTED
    }
  });
}

export async function completeGoogleCalendarOnboarding(input: { code: string; expectedSiteId?: string; state: string }) {
  const state = verifyGoogleCalendarState(input.state);
  if (input.expectedSiteId && input.expectedSiteId !== state.siteId) {
    throw new Error("Google Calendar state does not match the current site.");
  }

  if (state.ownerType === SchedulingCalendarOwnerType.STAFF) {
    const staff = await prisma.staffMember.findFirst({ where: { id: state.ownerId, siteId: state.siteId }, select: { id: true } });
    if (!staff) throw new Error("Google Calendar staff connection is no longer valid.");
  }

  const token = await exchangeAuthorizationCode(input.code);
  if (!token.access_token) throw new Error("Google Calendar did not return an access token.");

  await upsertGoogleCalendarConnection({
    accessToken: token.access_token,
    expiresAt: expiresAt(token.expires_in),
    ownerId: state.ownerId,
    ownerType: state.ownerType,
    refreshToken: token.refresh_token,
    scope: token.scope,
    siteId: state.siteId
  });

  return state.siteId;
}

async function accessTokenForConnection(connection: {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: Date | null;
  id: string;
}) {
  if (!isExpired(connection.expiresAt)) {
    return decryptCalendarSecret(connection.encryptedAccessToken);
  }

  const refreshToken = decryptCalendarSecret(connection.encryptedRefreshToken);
  if (!refreshToken) throw new Error("Google Calendar refresh token is missing.");

  const token = await refreshAccessToken(refreshToken);
  if (!token.access_token) throw new Error("Google Calendar did not return a refreshed access token.");

  await prisma.schedulingCalendarConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptCalendarSecret(token.access_token),
      expiresAt: expiresAt(token.expires_in),
      lastError: "",
      lastVerifiedAt: new Date(),
      status: SchedulingCalendarConnectionStatus.CONNECTED
    }
  });

  return token.access_token;
}

async function queryFreeBusy(input: { accessToken: string; calendarId: string; end: Date; start: Date; timeZone: string }) {
  const response = await fetch(googleFreeBusyUrl, {
    body: JSON.stringify({
      calendarExpansionMax: 1,
      items: [{ id: input.calendarId || "primary" }],
      timeMax: input.end.toISOString(),
      timeMin: input.start.toISOString(),
      timeZone: input.timeZone
    }),
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const body = (await response.json()) as FreeBusyResponse;
  if (!response.ok) throw new Error(`Google Calendar free/busy request failed with status ${response.status}.`);

  const calendar = body.calendars?.[input.calendarId || "primary"];
  if (calendar?.errors?.length) {
    throw new Error(`Google Calendar free/busy returned ${calendar.errors[0]?.reason || "an error"}.`);
  }

  return (calendar?.busy || [])
    .map((busy) => ({
      end: new Date(busy.end || ""),
      start: new Date(busy.start || "")
    }))
    .filter((busy) => !Number.isNaN(busy.start.getTime()) && !Number.isNaN(busy.end.getTime()));
}

export async function getGoogleCalendarConnections(siteId: string) {
  return prisma.schedulingCalendarConnection.findMany({
    where: {
      provider: SchedulingCalendarProvider.GOOGLE,
      siteId
    },
    orderBy: [{ ownerType: "asc" }, { ownerId: "asc" }]
  });
}

export async function listGoogleBusyWindows(input: { end: Date; siteId: string; staffIds: string[]; start: Date; timeZone: string }): Promise<CalendarBusyResult> {
  const ownerIds = [...new Set(input.staffIds.filter(Boolean))];
  const connections = await prisma.schedulingCalendarConnection.findMany({
    where: {
      provider: SchedulingCalendarProvider.GOOGLE,
      siteId: input.siteId,
      OR: [
        { ownerType: SchedulingCalendarOwnerType.SITE, ownerId: "" },
        ...(ownerIds.length ? [{ ownerType: SchedulingCalendarOwnerType.STAFF, ownerId: { in: ownerIds } }] : [])
      ]
    }
  });

  const result: CalendarBusyResult = { busy: [], unavailable: [] };
  for (const connection of connections) {
    try {
      const accessToken = await accessTokenForConnection(connection);
      const busy = await queryFreeBusy({
        accessToken,
        calendarId: connection.calendarId,
        end: input.end,
        start: input.start,
        timeZone: input.timeZone
      });
      await prisma.schedulingCalendarConnection.update({
        where: { id: connection.id },
        data: {
          lastError: "",
          lastVerifiedAt: new Date(),
          status: SchedulingCalendarConnectionStatus.CONNECTED
        }
      });
      result.busy.push(
        ...busy.map((window) => ({
          ...window,
          ownerId: connection.ownerId,
          ownerType: connection.ownerType
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Calendar could not be checked.";
      result.unavailable.push({
        message,
        ownerId: connection.ownerId,
        ownerType: connection.ownerType
      });
      await prisma.schedulingCalendarConnection.update({
        where: { id: connection.id },
        data: {
          lastError: message.slice(0, 1000),
          lastVerifiedAt: new Date(),
          status: SchedulingCalendarConnectionStatus.ERROR
        }
      });
    }
  }

  return result;
}

export function googleCalendarConnectionLabel(connection: {
  ownerId: string;
  ownerType: SchedulingCalendarOwnerType;
  staff?: { name: string } | null;
}) {
  if (connection.ownerType === SchedulingCalendarOwnerType.STAFF) {
    return connection.staff?.name || "Staff calendar";
  }

  return "Business calendar";
}

export function googleCalendarConnectPath(input: { ownerId?: string; ownerType: SchedulingCalendarOwnerType }) {
  const params = new URLSearchParams({ ownerType: input.ownerType });
  if (input.ownerType === SchedulingCalendarOwnerType.STAFF && input.ownerId) params.set("staffId", input.ownerId);
  return `/api/scheduling/google-calendar/connect/start?${params.toString()}`;
}

export function googleCalendarMetadata(connection: {
  calendarId: string;
  connectedAt: Date | null;
  lastError: string;
  lastVerifiedAt: Date | null;
  scope: string;
  status: SchedulingCalendarConnectionStatus;
}): Prisma.InputJsonObject {
  return {
    calendarId: connection.calendarId,
    connectedAt: connection.connectedAt?.toISOString() || "",
    lastError: connection.lastError,
    lastVerifiedAt: connection.lastVerifiedAt?.toISOString() || "",
    scope: connection.scope,
    status: connection.status
  };
}
