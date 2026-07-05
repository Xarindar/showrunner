import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { publicAppBaseUrl } from "@/lib/env";
import { CONNECT_NONCE_COOKIE, completeConnectHandoff, isOAuthConnectProvider } from "@/lib/payments/connect/flow";
import { resolveCurrentSite } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConnectRouteProps = { params: Promise<{ provider: string }> };

function paymentsRedirect(key: "connectError" | "connected", value: string) {
  const url = new URL("/admin/modules/payments", publicAppBaseUrl());
  url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  // The nonce is single-use: clear it whether the handoff succeeded or failed.
  response.cookies.set(CONNECT_NONCE_COOKIE, "", { maxAge: 0, path: "/api/payments/connect" });
  return response;
}

export async function GET(request: NextRequest, { params }: ConnectRouteProps) {
  const user = await requireAdmin("settings:update");
  const { provider } = await params;
  if (!isOAuthConnectProvider(provider)) {
    return paymentsRedirect("connectError", "That provider does not support one-click connect.");
  }

  const brokerError = request.nextUrl.searchParams.get("error");
  if (brokerError) {
    const description = request.nextUrl.searchParams.get("error_description") || "";
    const message =
      brokerError === "access_denied"
        ? "The connection was canceled before finishing."
        : description || `Connect did not complete (${brokerError}).`;
    return paymentsRedirect("connectError", message);
  }

  const handoffToken = request.nextUrl.searchParams.get("handoff") || "";
  if (!handoffToken) {
    return paymentsRedirect("connectError", "The connect handoff was incomplete. Try connecting again.");
  }

  try {
    const site = await resolveCurrentSite();
    const result = await completeConnectHandoff({
      handoffToken,
      nonceCookie: request.cookies.get(CONNECT_NONCE_COOKIE)?.value,
      provider,
      siteId: site.id
    });

    await recordAuditLog({
      action: "settings.payment_provider.connected",
      actor: user,
      metadata: { onboarding: "oauth", provider: result.provider, webhookAutoCreated: result.webhookAutoCreated },
      siteId: site.id,
      targetId: site.id,
      targetLabel: site.name,
      targetType: "payment_gateway"
    });

    return paymentsRedirect("connected", provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connect could not be completed.";
    return paymentsRedirect("connectError", message);
  }
}
