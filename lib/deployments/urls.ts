import "server-only";

import { headers } from "next/headers";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export async function getAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return trimTrailingSlash(configured);

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}

export function deploymentInviteUrl(baseUrl: string, token: string) {
  return `${trimTrailingSlash(baseUrl)}/deploy/${encodeURIComponent(token)}`;
}

export function deploymentGithubCallbackUrl(baseUrl: string) {
  return `${trimTrailingSlash(baseUrl)}/api/deployments/github/callback`;
}
