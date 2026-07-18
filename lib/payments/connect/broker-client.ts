import crypto from "node:crypto";
import { getConnectBrokerConfig } from "./config";
import { signServiceRequest, type ServiceRequestEnvelope } from "./tokens";

type BrokerProvider = "stripe" | "square";

export async function brokerRequest<T>(input: {
  path: string;
  provider: BrokerProvider;
  siteId: string;
  fields: Record<string, unknown>;
}): Promise<T> {
  const broker = getConnectBrokerConfig();
  if (!broker) throw new Error("One-click connect is not configured for this deployment.");

  const iat = Math.floor(Date.now() / 1000);
  const envelope: ServiceRequestEnvelope = {
    client_id: broker.clientId,
    site_id: input.siteId,
    provider: input.provider,
    iat,
    exp: iat + 5 * 60,
    request_id: crypto.randomBytes(24).toString("base64url")
  };
  const body = JSON.stringify({ ...envelope, ...input.fields });
  const response = await fetch(`${broker.baseUrl}${input.path}`, {
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-AdmitOne-Signature": signServiceRequest("POST", input.path, body, envelope, broker.sharedSecret)
    },
    method: "POST",
    signal: AbortSignal.timeout(10_000)
  });

  const text = await response.text();
  let parsed: { message?: string } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // Status handling below returns a generic error for non-JSON responses.
  }
  if (!response.ok) {
    throw new Error(parsed.message || `Connect broker request failed (status ${response.status}).`);
  }
  return parsed as T;
}

export async function revokeOAuthProvider(input: {
  provider: BrokerProvider;
  siteId: string;
  externalAccountId: string;
}) {
  await brokerRequest<void>({
    path: `/connect/${input.provider}/revoke`,
    provider: input.provider,
    siteId: input.siteId,
    fields: { externalAccountId: input.externalAccountId }
  });
}
