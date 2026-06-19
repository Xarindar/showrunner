import { CreditCard, Save } from "lucide-react";
import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { dataScopePresets, parseDataScopeConfig, requireAdmin, scopableModules } from "@/lib/auth";
import { listSiteApiKeys } from "@/lib/embed/keys";
import { EMBED_SCOPES } from "@/lib/embed/scopes";
import { enumLabel } from "@/lib/format";
import { getConnectedGatewayCredential } from "@/lib/payments/credentials";
import { getStripePaymentMethodSettings } from "@/lib/payments/methods";
import { getPaymentOnboardingStatus, sanitizePaymentOnboardingError } from "@/lib/payments/onboarding-status";
import { isRequiredModule } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
import { getPlatformStatus, platformFoundationItems } from "@/lib/platform-status";
import { getSiteSettings } from "@/lib/site";
import { normalizeThemePreset, themePresetOptions } from "@/lib/theme/tokens";
import {
  createSiteApiKeyAction,
  revokeSiteApiKeyAction,
  updateCheckoutProviderAction,
  updateSettingsAction,
  updateSiteApiKeyOriginsAction,
  updateStripePaymentMethodsAction } from "./actions";
import { Button, ButtonAnchor, Card, EqualGrid } from "@/components/ui";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;}>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  await requireAdmin("settings:update");
  const [{ saved, error }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [platformStatus, stripePaymentMethods, squareCredential, paypalCredential, apiKeys] = await Promise.all([
  getPlatformStatus(settings),
  getStripePaymentMethodSettings(settings.siteId),
  getConnectedGatewayCredential(settings.siteId, PaymentProvider.SQUARE),
  getConnectedGatewayCredential(settings.siteId, PaymentProvider.PAYPAL),
  listSiteApiKeys(settings.siteId)]
  );
  const dataScopeConfig = parseDataScopeConfig(settings.dataScopeConfig);
  const dataScopeModules = scopableModules();
  const stripeCredential = stripePaymentMethods.credential;
  const stripeConnected = stripePaymentMethods.connected;
  const squareConnected = squareCredential?.status === PaymentGatewayConnectionStatus.CONNECTED && Boolean(squareCredential.merchantId);
  const paypalConnected = paypalCredential?.status === PaymentGatewayConnectionStatus.CONNECTED && Boolean(paypalCredential.merchantId);
  const errorMessage = error ? sanitizePaymentOnboardingError(error) : "";
  const stripeOnboarding = getPaymentOnboardingStatus(PaymentProvider.STRIPE);
  const squareOnboarding = getPaymentOnboardingStatus(PaymentProvider.SQUARE);
  const paypalOnboarding = getPaymentOnboardingStatus(PaymentProvider.PAYPAL);
  const paymentConnectionRows = [
    {
      connected: stripeConnected,
      href: "/api/payments/stripe/connect/start",
      onboarding: stripeOnboarding,
      reconnectLabel: "Reconnect Stripe",
      variant: undefined
    },
    {
      connected: squareConnected,
      href: "/api/payments/square/connect/start",
      onboarding: squareOnboarding,
      reconnectLabel: "Reconnect Square",
      variant: "secondary" as const
    },
    {
      connected: paypalConnected,
      href: "/api/payments/paypal/connect/start",
      onboarding: paypalOnboarding,
      reconnectLabel: "Reconnect PayPal",
      variant: "secondary" as const
    }
  ];
  const selectedProviderDisconnected =
  settings.checkoutProvider === PaymentProvider.STRIPE && !stripeConnected ||
  settings.checkoutProvider === PaymentProvider.SQUARE && !squareConnected ||
  settings.checkoutProvider === PaymentProvider.PAYPAL && !paypalConnected;
  const activeCheckoutProvider =
  selectedProviderDisconnected ?
  stripeConnected ? PaymentProvider.STRIPE : squareConnected ? PaymentProvider.SQUARE : paypalConnected ? PaymentProvider.PAYPAL : undefined :
  settings.checkoutProvider;
  const checkoutProviderConnected = stripeConnected || squareConnected || paypalConnected;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Client configuration</h1>
          <p>Business details, visual basics, media mode, module state, and platform foundations for multi-site, roles, audit, and policy controls.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Settings saved.</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid aria-label="Settings structure" as="section" min="220px">
        <Card>
          <h2 className="compact-title">Business</h2>
          <p>Identity, contact email, and timezone for public pages and notifications.</p>
        </Card>
        <Card>
          <h2 className="compact-title">Modules</h2>
          <p>{platformStatus.enabledCount} modules enabled, including required platform modules for the admin shell.</p>
        </Card>
        <Card>
          <h2 className="compact-title">Security and data</h2>
          <p>{platformFoundationItems.length} foundation items tracked for roles, audit logs, site scoping, and policy controls.</p>
        </Card>
      </EqualGrid>

      <Card as="section" minHeight="none" bodyClassName="form-grid">
        <EqualGrid>
          <div>
            <h2 className="compact-title">Payments</h2>
            <p>Connect the client&apos;s payment account through a secure provider-hosted flow. No API keys are entered on this screen.</p>
          </div>
        </EqualGrid>
        <div className="module-toggle-grid">
          {paymentConnectionRows.map((row) => {
            const connectLabel = row.connected ? row.reconnectLabel : `Connect ${row.onboarding.label}`;

            return (
              <div className="module-toggle-row" key={row.onboarding.provider}>
                <CreditCard aria-hidden="true" size={18} />
                <span className="module-toggle-main">
                  <span>
                    <strong>{row.onboarding.label}</strong>
                    <span className={row.connected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                      {row.connected ? "Connected" : "Not connected"}
                    </span>
                    <span className={row.onboarding.ready ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                      {row.onboarding.statusLabel}
                    </span>
                  </span>
                  <small>{row.onboarding.description}</small>
                </span>
                {row.onboarding.ready ?
                <ButtonAnchor href={row.href} variant={row.variant}>
                    <CreditCard size={18} />
                    {connectLabel}
                  </ButtonAnchor> :
                <Button disabled type="button" variant={row.variant}>
                    <CreditCard size={18} />
                    Not enabled
                  </Button>}
              </div>);

          })}
        </div>
        <form action={updateCheckoutProviderAction} className="subpanel form-grid">
          <div>
            <h3>Checkout provider</h3>
            <p className="ui-zero">Choose which connected provider creates new public checkout sessions.</p>
            {selectedProviderDisconnected ?
            <p className="error ui-zero">
                Connect a payment provider before using hosted public checkout.
              </p> :
            null}
          </div>
          <div className="module-toggle-grid">
            <label className="module-toggle-row">
              <input
                disabled={!stripeConnected}
                name="checkoutProvider"
                type="radio"
                value={PaymentProvider.STRIPE}
                defaultChecked={activeCheckoutProvider === PaymentProvider.STRIPE} />
              
              <span className="module-toggle-main">
                <span>
                  <strong>Stripe</strong>
                  <span className={stripeConnected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                    {stripeConnected ? "Connected account" : stripeOnboarding.ready ? "Connect first" : "Not enabled"}
                  </span>
                </span>
                <small>
                  {stripeConnected ?
                  "Hosted Stripe Checkout with connected-account settlement." :
                  stripeOnboarding.ready ?
                  "Connect Stripe above before using it for public checkout." :
                  "Stripe is not enabled for this workspace yet."}
                </small>
              </span>
            </label>
            <label className="module-toggle-row">
              <input
                disabled={!squareConnected}
                name="checkoutProvider"
                type="radio"
                value={PaymentProvider.SQUARE}
                defaultChecked={activeCheckoutProvider === PaymentProvider.SQUARE} />
              
              <span className="module-toggle-main">
                <span>
                  <strong>Square</strong>
                  <span className={squareConnected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                    {squareConnected ? "Connected account" : squareOnboarding.ready ? "Connect first" : "Not enabled"}
                  </span>
                </span>
                <small>
                  {squareConnected ?
                  `Merchant ${squareCredential?.merchantId}, location ${squareCredential?.displayName || "connected"}.` :
                  squareOnboarding.ready ?
                  "Connect Square before using it for public checkout." :
                  "Square is not enabled for this workspace yet."}
                </small>
              </span>
            </label>
            <label className="module-toggle-row">
              <input
                disabled={!paypalConnected}
                name="checkoutProvider"
                type="radio"
                value={PaymentProvider.PAYPAL}
                defaultChecked={activeCheckoutProvider === PaymentProvider.PAYPAL} />
              
              <span className="module-toggle-main">
                <span>
                  <strong>PayPal</strong>
                  <span className={paypalConnected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                    {paypalConnected ? "Connected account" : paypalOnboarding.ready ? "Connect first" : "Not enabled"}
                  </span>
                </span>
                <small>
                  {paypalConnected ?
                  `Merchant ${paypalCredential?.merchantId || paypalCredential?.displayName}.` :
                  paypalOnboarding.ready ?
                  "Connect PayPal before using it for public checkout." :
                  "PayPal is not enabled for this workspace yet."}
                </small>
              </span>
            </label>
          </div>
          <Button disabled={!checkoutProviderConnected} type="submit" variant="secondary">
            <CreditCard size={18} />
            Save checkout provider
          </Button>
        </form>
        {stripeConnected ?
        <>
            <div className="subpanel">
              <strong>{stripeCredential?.displayName || stripeCredential?.externalAccountId}</strong>
              <small>Stripe account: {stripeCredential?.externalAccountId}</small>
            </div>
            <form action={updateStripePaymentMethodsAction} className="subpanel form-grid">
              <div>
                <h3>Checkout methods</h3>
                <p className="ui-zero">Choose which Stripe-backed options can appear at checkout.</p>
              </div>
              <div className="module-toggle-grid">
                {stripePaymentMethods.options.map((option) => {
                const checked = stripePaymentMethods.enabledKeys.includes(option.key);
                const applePayStatus =
                option.key === "APPLE_PAY" && stripePaymentMethods.applePayDomain.status ?
                stripePaymentMethods.applePayDomain.status :
                "";

                return (
                  <label className="module-toggle-row" key={option.key}>
                      <input name="stripePaymentMethods" type="checkbox" value={option.key} defaultChecked={checked} />
                      <span className="module-toggle-main">
                        <span>
                          <strong>{option.label}</strong>
                          <span className="ui-badge">{option.type}</span>
                          {applePayStatus ? <span className={applePayStatus === "verified" ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>{applePayStatus}</span> : null}
                        </span>
                        <small>
                          {option.stripePaymentMethod === "card" ?
                        "Card-backed Stripe Checkout method." :
                        `Stripe Checkout payment_method_types: ${option.stripePaymentMethod}.`}
                        </small>
                      </span>
                    </label>);

              })}
              </div>
              <Button type="submit" variant="secondary">
                <CreditCard size={18} />
                Save payment methods
              </Button>
            </form>
          </> :
        null}
      </Card>

      <Card action={updateSettingsAction} as="form" minHeight="none" bodyClassName="form-grid">
        <section className="subpanel form-grid">
          <h2 className="compact-title">Business</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="businessName">Business name</label>
              <input id="businessName" name="businessName" defaultValue={settings.businessName} required />
            </div>
            <div className="ui-field">
              <label htmlFor="contactEmail">Contact email</label>
              <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} required />
            </div>
          </EqualGrid>

          <div className="ui-field">
            <label htmlFor="timezone">Timezone</label>
            <input id="timezone" name="timezone" defaultValue={settings.timezone} required />
          </div>
        </section>

        <section className="subpanel form-grid">
          <h2 className="compact-title">Theme and media</h2>
          <EqualGrid min="220px">
            <div className="ui-field">
              <label htmlFor="themePreset">Style preset</label>
              <select id="themePreset" name="themePreset" defaultValue={normalizeThemePreset(settings.themePreset)}>
                {themePresetOptions.map((preset) =>
                <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="themePrimary">Primary color</label>
              <input id="themePrimary" name="themePrimary" type="color" defaultValue={settings.themePrimary} />
            </div>
            <div className="ui-field">
              <label htmlFor="mediaDriver">Media mode</label>
              <select id="mediaDriver" name="mediaDriver" defaultValue={settings.mediaDriver}>
                <option value="REPO">Repo assets</option>
                <option value="R2">Cloudflare R2 uploads</option>
                <option value="CLOUDFLARE_IMAGES">Cloudflare Images</option>
              </select>
            </div>
          </EqualGrid>
        </section>

        <section className="subpanel form-grid">
          <div>
            <h2 className="compact-title">Analytics and privacy</h2>
            <p>Configure client-side adapter IDs and the server-enforced retention window. Consent UI remains a separate release gate.</p>
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="ga4MeasurementId">GA4 measurement ID</label>
              <input id="ga4MeasurementId" name="ga4MeasurementId" defaultValue={settings.ga4MeasurementId} placeholder="G-XXXXXXXXXX" />
            </div>
            <div className="ui-field">
              <label htmlFor="googleAdsTagId">Google Ads tag ID</label>
              <input id="googleAdsTagId" name="googleAdsTagId" defaultValue={settings.googleAdsTagId} placeholder="AW-XXXXXXXXX" />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="metaPixelId">Meta Pixel ID</label>
              <input id="metaPixelId" name="metaPixelId" defaultValue={settings.metaPixelId} placeholder="123456789012345" />
            </div>
            <div className="ui-field">
              <label htmlFor="analyticsRetentionDays">Analytics retention (days)</label>
              <input
                id="analyticsRetentionDays"
                name="analyticsRetentionDays"
                type="number"
                min="30"
                max="3650"
                defaultValue={settings.analyticsRetentionDays} />
              
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="searchConsoleVerification">Google Search Console verification</label>
            <input
              id="searchConsoleVerification"
              name="searchConsoleVerification"
              defaultValue={settings.searchConsoleVerification}
              placeholder="google-site-verification token" />
            
          </div>
        </section>

        <section className="subpanel form-grid">
          <div>
            <h2 className="compact-title">Modules</h2>
            <p>Enabled modules appear in the sidebar. Required platform modules stay on so the admin shell remains reachable.</p>
          </div>
          <div className="module-toggle-grid">
            {platformStatus.modules.map((item) => {
              const status = item.module.status as ModuleStatus;
              const required = isRequiredModule(item.module.id);

              return (
                <label key={item.module.id} className="module-toggle-row">
                  {required ? <input type="hidden" name="enabledModules" value={item.module.id} /> : null}
                  <input
                    name="enabledModules"
                    type="checkbox"
                    value={item.module.id}
                    defaultChecked={item.enabled || required}
                    disabled={status === "future" || required} />
                  
                  <span className="module-toggle-main">
                    <span>
                      <strong>{item.module.label}</strong>
                      {required ? <span className="ui-badge">Required</span> : null}
                    </span>
                    <small>{item.module.readiness.summary}</small>
                    {item.module.readiness.primaryGap ? <small>{item.module.readiness.primaryGap}</small> : null}
                  </span>
                  <span className={item.pillClassName}>{item.readinessLabel}</span>
                </label>);

            })}
          </div>
        </section>

        <section className="subpanel form-grid">
          <div>
            <h2 className="compact-title">Security and data foundations</h2>
            <p>These schema and policy items track what is in place and what remains before multi-site rollout.</p>
          </div>
          {dataScopeModules.length ?
          <div className="subpanel form-grid">
              <EqualGrid>
                <div>
                  <h3>Record access scope</h3>
                  <p className="ui-zero">
                    Choose whether constrained roles can see all records in a module or only records they own.
                  </p>
                </div>
                <div className="ui-field">
                  <label htmlFor="dataScopePreset">Apply preset on save</label>
                  <select id="dataScopePreset" name="dataScopePreset" defaultValue="custom">
                    <option value="custom">Keep matrix below</option>
                    {dataScopePresets.map((preset) =>
                  <option key={preset} value={preset}>
                        {preset === "single-person" ? "Single-person: all records" : "Team: own records by default"}
                      </option>
                  )}
                  </select>
                </div>
              </EqualGrid>
              <div className="module-toggle-grid">
                {dataScopeModules.map((module) =>
              <div className="module-toggle-row" key={module.id}>
                    <span className="module-toggle-main">
                      <strong>{module.label}</strong>
                      <small>Manifest-owned scope for {module.id} records.</small>
                    </span>
                    <span className="ui-zero">
                      {module.scopableRoles.map((role) =>
                  <label className="ui-field ui-zero" key={`${module.id}-${role}`}>
                          <span>{enumLabel(role)}</span>
                          <select name={`dataScope:${module.id}:${role}`} defaultValue={dataScopeConfig[module.id]?.[role] || "OWN"}>
                            <option value="OWN">Own records</option>
                            <option value="ALL">All records</option>
                          </select>
                        </label>
                  )}
                    </span>
                  </div>
              )}
              </div>
            </div> :
          null}
          <div className="foundation-list">
            {platformFoundationItems.map((item) =>
            <div className="foundation-row" key={item.key}>
                <span className={item.status === "schema-ready" ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>{item.status.replaceAll("-", " ")}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                  <small>Models: {item.models.join(", ")}</small>
                </span>
              </div>
            )}
          </div>
        </section>

        <Button type="submit">
          <Save size={18} />
          Save settings
        </Button>
      </Card>

      <Card aria-label="Embeds and public API" as="section" minHeight="none" bodyClassName="form-grid">
        <div>
          <h2 className="compact-title">Embeds &amp; public API</h2>
          <p>
            Publishable keys let booking, gallery, and storefront widgets call the public API from another website.
            Browser use only works from the origins you list below, so widget keys are safe to ship in page source
            (like a Stripe publishable key). Originless backend use must be enabled explicitly. Test a key against <code>/api/public/v1/ping</code>.
          </p>
        </div>

        {apiKeys.length ?
        <div className="foundation-list">
            {apiKeys.map((key) =>
          <div className="subpanel form-grid" key={key.id}>
                <EqualGrid>
                  <div>
                    <strong>{key.name || "Untitled key"}</strong>
                    <small className="ui-zero">
                      <code>{key.publicKey}</code>
                    </small>
                    <small className="ui-zero">
                      Scopes: {key.scopes.length ? key.scopes.join(", ") : "none"} · Last used:{" "}
                      {key.lastUsedAt ? key.lastUsedAt.toISOString().slice(0, 10) : "never"}
                    </small>
                    <small className="ui-zero">
                      Server-to-server without Origin: {key.allowServerToServer ? "allowed" : "blocked"}
                    </small>
                  </div>
                  <div className="ui-zero">
                    <span className={key.enabled ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>{key.enabled ? "Active" : "Revoked"}</span>
                    {key.enabled ?
                <form action={revokeSiteApiKeyAction} className="ui-field ui-zero">
                        <input type="hidden" name="keyId" value={key.id} />
                        <label htmlFor={`revoke-${key.id}`}>Type REVOKE</label>
                        <input id={`revoke-${key.id}`} name="confirmRevoke" placeholder="REVOKE" />
                        <Button type="submit" variant="secondary">Revoke</Button>
                      </form> :
                null}
                  </div>
                </EqualGrid>
                {key.enabled ?
            <form action={updateSiteApiKeyOriginsAction} className="ui-field">
                    <label htmlFor={`origins-${key.id}`}>Allowed origins (one per line)</label>
                    <textarea
                id={`origins-${key.id}`}
                name="allowedOrigins"
                rows={2}
                defaultValue={key.allowedOrigins.join("\n")}
                placeholder="https://clientsite.com" />
              
                    <input type="hidden" name="keyId" value={key.id} />
                    <Button type="submit" className="ui-zero" variant="secondary">Save origins</Button>
                  </form> :
            null}
              </div>
          )}
          </div> :

        <p className="ui-zero">No embed keys yet. Create one to start embedding widgets on another site.</p>
        }

        <form action={createSiteApiKeyAction} className="subpanel form-grid">
          <h3>Create an embed key</h3>
          <div className="ui-field">
            <label htmlFor="embedKeyName">Key name</label>
            <input id="embedKeyName" name="name" placeholder="Client marketing site" required />
          </div>
          <div className="ui-field">
            <label htmlFor="embedKeyOrigins">Allowed origins (one per line)</label>
            <textarea id="embedKeyOrigins" name="allowedOrigins" rows={3} placeholder="https://clientsite.com" />
            <small className="muted-text">
              Browser widgets need every site origin they load on. Originless server calls are blocked unless enabled below.
            </small>
          </div>
          <label className="module-toggle-row">
            <input type="checkbox" name="allowServerToServer" />
            <span className="module-toggle-main">
              <strong>Allow server-to-server calls without Origin</strong>
              <small>Use only for deliberate backend integrations; browser widgets should rely on the origin allowlist.</small>
            </span>
          </label>
          <div className="module-toggle-grid">
            {EMBED_SCOPES.map((scope) =>
            <label className="module-toggle-row" key={scope}>
                <input type="checkbox" name="scopes" value={scope} defaultChecked={scope === "scheduling:read"} />
                <span className="module-toggle-main">
                  <strong>{scope}</strong>
                </span>
              </label>
            )}
          </div>
          <Button type="submit">Create key</Button>
        </form>
      </Card>
    </div>);

}
