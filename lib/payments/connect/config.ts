// One-click OAuth onboarding goes through the AdmitOne Connect broker — a tiny
// standalone service that holds the platform-level Stripe Connect / Square app
// credentials and hands the merchant's own tokens back to this deployment. The
// broker is only in the connect path, never the payment path: once the handoff
// lands, this deployment charges the provider directly with the stored tokens.

export type ConnectBrokerConfig = {
  baseUrl: string;
  clientId: string;
  sharedSecret: string;
};

export function getConnectBrokerConfig(): ConnectBrokerConfig | null {
  const baseUrl = (process.env.ADMITONE_CONNECT_BASE_URL || "").trim().replace(/\/$/, "");
  const clientId = (process.env.ADMITONE_CONNECT_CLIENT_ID || "").trim();
  const sharedSecret = (process.env.ADMITONE_CONNECT_SHARED_SECRET || "").trim();
  if (!baseUrl || !clientId || !sharedSecret) return null;
  return { baseUrl, clientId, sharedSecret };
}

export function isConnectBrokerConfigured() {
  return getConnectBrokerConfig() !== null;
}
