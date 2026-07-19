import type { ReactNode } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import {
  dashboardCardCatalogGroups,
  getDashboardCardPlacements,
  normalizeDashboardCardSettings,
  placedDashboardCards,
  type DashboardCardDefinition,
  type DashboardCardPlacement
} from "@/shell/dashboard-cards";
import { ButtonLink, EmptyState, Feedback } from "@/components/ui";
import { DashboardWidgetsBoard } from "./dashboard-board";
import { getOnboardingChecklist } from "./onboarding";
import type { DashboardWidgetSettings } from "@/shell/dashboard-widget-types";
import { getDashboardCardMinimumLayout } from "@/shell/dashboard-layout";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const savedMessages: Record<string, string> = {
  "dashboard-card-added": "Dashboard card added.",
  "dashboard-card-exists": "That card is already on your dashboard.",
  "dashboard-card-removed": "Dashboard card removed.",
  "dashboard-card-settings-saved": "Widget settings saved."
};

function DashboardStatusMessage({ error, saved }: { error?: string; saved?: string }) {
  if (error) return <Feedback tone="danger">{error}</Feedback>;
  if (saved) return <Feedback tone="success">{savedMessages[saved] || "Dashboard updated."}</Feedback>;
  return null;
}

async function renderCardBody(
  card: DashboardCardDefinition,
  size: DashboardCardPlacement["size"],
  siteId: string,
  timezone: string,
  widgetSettings: DashboardWidgetSettings,
  preview = false
) {
  try {
    return await card.render({ preview, settings: widgetSettings, siteId, size, timezone });
  } catch (error) {
    console.error("[dashboard-card-render-failed]", card.id, error);
    return <EmptyState title="Card unavailable" description="This card could not load its data." />;
  }
}

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const query = searchParams ? await searchParams : {};
  const user = await requireAuthenticatedAdmin();
  const settings = await getSiteSettings();
  const [onboarding, placements] = await Promise.all([
    getOnboardingChecklist(settings),
    getDashboardCardPlacements(settings.siteId, user.id, settings.enabledModuleIds)
  ]);
  const progressPercent = onboarding.total ? Math.round((onboarding.completed / onboarding.total) * 100) : 0;
  const placedCards = placedDashboardCards(placements);
  const renderedCards = await Promise.all(
    placedCards.map(async ({ card, module: shellModule, placement }) => {
      const minimumLayout = getDashboardCardMinimumLayout(card.sizes);

      return {
        body: await renderCardBody(card, placement.size, settings.siteId, settings.timezone, placement.settings),
        cardId: card.id,
        columns: placement.columns,
        description: card.description,
        instanceId: placement.instanceId,
        minColumns: minimumLayout.columns,
        minRows: minimumLayout.rows,
        moduleHref: shellModule.href,
        moduleIcon: shellModule.icon,
        rows: placement.rows,
        settingsDefinition: card.settings || [],
        settingsValues: placement.settings,
        size: placement.size,
        title: card.title
      };
    })
  );
  const catalogGroups = await Promise.all(
    dashboardCardCatalogGroups(settings.enabledModuleIds, placements).map(async ({ cards, module }) => ({
      cards: await Promise.all(
        cards.map(async (card) => ({
          body: await renderCardBody(
            card,
            card.defaultSize,
            settings.siteId,
            settings.timezone,
            normalizeDashboardCardSettings(card.id, undefined),
            true
          ),
          defaultSize: card.defaultSize,
          description: card.description,
          id: card.id,
          title: card.title
        }))
      ),
      module: {
        icon: module.icon,
        id: module.id,
        label: module.label
      }
    }))
  );
  const quickCardsKey = renderedCards
    .map((card) => `${card.instanceId}:${card.columns}:${card.rows}:${card.size}:${JSON.stringify(card.settingsValues)}`)
    .join("|");

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{settings.businessName}</h1>
          <p>Build a home dashboard from the module cards you actually use.</p>
        </div>
      </header>

      <DashboardStatusMessage error={query.error} saved={query.saved} />

      {onboarding.total > 0 && !onboarding.allDone ? (
        <section className="onboarding-card" aria-label="Setup checklist">
          <div className="onboarding-head">
            <div>
              <p className="eyebrow">Getting started</p>
              <h2>Finish setting up your booking site</h2>
              <p>
                {onboarding.completed} of {onboarding.total} done - a few quick steps to start taking bookings.
              </p>
            </div>
            <span className="onboarding-progress-count" aria-hidden="true">
              {progressPercent}%
            </span>
          </div>
          <div className="onboarding-progress-track" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progressPercent}>
            <span className="onboarding-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <ol className="onboarding-steps">
            {onboarding.steps.map((step) => (
              <li className={`onboarding-step${step.done ? " is-done" : ""}`} key={step.id}>
                <span className="onboarding-step-icon" aria-hidden="true">
                  {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </span>
                <span className="onboarding-step-body">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
                {step.done ? (
                  <span className="onboarding-step-state">Done</span>
                ) : (
                  <ButtonLink className="onboarding-step-cta" href={step.href} variant="secondary" size="sm">
                    {step.cta}
                  </ButtonLink>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {onboarding.allDone ? (
        <section className="onboarding-card onboarding-card-done" aria-label="Setup complete">
          <div className="onboarding-done">
            <span className="onboarding-done-icon" aria-hidden="true">
              <CheckCircle2 size={24} />
            </span>
            <span className="onboarding-done-body">
              <strong>Admin setup is ready</strong>
              <small>The new client booking surface is being rebuilt under clients/booking.</small>
            </span>
            <ButtonLink href="/admin/modules/services" variant="secondary" size="sm">
              Review services
            </ButtonLink>
          </div>
        </section>
      ) : null}

      <DashboardWidgetsBoard
        cards={renderedCards.map((card) => ({ ...card, body: card.body as ReactNode }))}
        catalogGroups={catalogGroups}
        key={quickCardsKey}
      />
    </div>
  );
}
