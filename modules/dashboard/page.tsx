import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ExternalLink, Plus, Trash2 } from "lucide-react";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { moduleIcons } from "@/shell/modules";
import {
  cardSizeColumnSpan,
  dashboardCardCatalogGroups,
  dashboardCardSizeLabel,
  dashboardCardSizes,
  getDashboardCardPlacements,
  placedDashboardCards,
  type DashboardCardDefinition,
  type DashboardCardPlacement
} from "@/shell/dashboard-cards";
import { Button, ButtonLink, Card, DashboardCardFrame, EmptyState, Feedback } from "@/components/ui";
import {
  addDashboardCardAction,
  moveDashboardCardAction,
  removeDashboardCardAction,
  resizeDashboardCardAction
} from "./actions";
import { getOnboardingChecklist } from "./onboarding";

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
  "dashboard-card-moved": "Dashboard card moved.",
  "dashboard-card-removed": "Dashboard card removed.",
  "dashboard-card-resized": "Dashboard card resized.",
  "dashboard-card-unchanged": "Dashboard card order stayed the same."
};

function DashboardStatusMessage({ error, saved }: { error?: string; saved?: string }) {
  if (error) return <Feedback tone="danger">{error}</Feedback>;
  if (saved) return <Feedback tone="success">{savedMessages[saved] || "Dashboard updated."}</Feedback>;
  return null;
}

function DashboardCardControls({
  card,
  index,
  placement,
  total
}: {
  card: DashboardCardDefinition;
  index: number;
  placement: DashboardCardPlacement;
  total: number;
}) {
  return (
    <div className="dashboard-card-controls">
      <form action={resizeDashboardCardAction} aria-label={`Resize ${card.title}`} className="dashboard-size-control">
        <input name="instanceId" type="hidden" value={placement.instanceId} />
        <input name="returnTo" type="hidden" value="/admin" />
        {dashboardCardSizes.map((size) => (
          <button
            aria-label={`Use ${dashboardCardSizeLabel(size).toLowerCase()} size`}
            aria-pressed={placement.size === size}
            className={placement.size === size ? "is-active" : ""}
            disabled={!card.sizes.includes(size)}
            key={size}
            name="size"
            title={dashboardCardSizeLabel(size)}
            type="submit"
            value={size}
          >
            {size.toUpperCase()}
          </button>
        ))}
      </form>
      <form action={moveDashboardCardAction} className="dashboard-icon-actions">
        <input name="instanceId" type="hidden" value={placement.instanceId} />
        <input name="returnTo" type="hidden" value="/admin" />
        <button aria-label="Move card up" disabled={index === 0} name="direction" title="Move up" type="submit" value="up">
          <ArrowUp size={15} />
        </button>
        <button
          aria-label="Move card down"
          disabled={index >= total - 1}
          name="direction"
          title="Move down"
          type="submit"
          value="down"
        >
          <ArrowDown size={15} />
        </button>
      </form>
      <form action={removeDashboardCardAction} className="dashboard-icon-actions">
        <input name="instanceId" type="hidden" value={placement.instanceId} />
        <input name="returnTo" type="hidden" value="/admin" />
        <button aria-label={`Remove ${card.title}`} title="Remove card" type="submit">
          <Trash2 size={15} />
        </button>
      </form>
    </div>
  );
}

async function renderCardBody(card: DashboardCardDefinition, placement: DashboardCardPlacement, siteId: string, timezone: string) {
  try {
    return await card.render({ siteId, size: placement.size, timezone });
  } catch (error) {
    console.error("[dashboard-card-render-failed]", card.id, error);
    return <EmptyState title="Card unavailable" description="This card could not load its data." />;
  }
}

function AddCardCatalog({
  groups
}: {
  groups: ReturnType<typeof dashboardCardCatalogGroups>;
}) {
  return (
    <Card
      as="section"
      className="dashboard-card-catalog"
      minHeight="none"
      reservedHeader={
        <div className="page-header compact-header">
          <div>
            <h2>Add cards from modules</h2>
            <p>Choose which module cards belong on your main dashboard.</p>
          </div>
        </div>
      }
    >
      {groups.length ? (
        <div className="dashboard-catalog-groups">
          {groups.map(({ cards, module }) => {
            const Icon = moduleIcons[module.icon];

            return (
              <section className="dashboard-catalog-group" key={module.id}>
                <h3>
                  <Icon size={18} />
                  {module.label}
                </h3>
                <div className="dashboard-catalog-list">
                  {cards.map((card) => (
                    <form action={addDashboardCardAction} className="dashboard-catalog-row" key={card.id}>
                      <input name="cardId" type="hidden" value={card.id} />
                      <input name="returnTo" type="hidden" value="/admin" />
                      <input name="size" type="hidden" value={card.defaultSize} />
                      <span>
                        <strong>{card.title}</strong>
                        <small>{card.description}</small>
                      </span>
                      <Button size="sm" type="submit" variant="secondary">
                        <Plus size={15} />
                        Add
                      </Button>
                    </form>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState title="All cards are on your dashboard" description="Remove a card if you want to swap in a different module view." />
      )}
    </Card>
  );
}

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps = {}) {
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
    placedCards.map(async ({ card, module: shellModule, placement }) => ({
      body: await renderCardBody(card, placement, settings.siteId, settings.timezone),
      card,
      module: shellModule,
      placement
    }))
  );
  const catalogGroups = dashboardCardCatalogGroups(settings.enabledModuleIds, placements);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{settings.businessName}</h1>
          <p>Build a home dashboard from the module cards you actually use.</p>
        </div>
        <ButtonLink href="/" variant="secondary">
          <ExternalLink size={18} />
          View public site
        </ButtonLink>
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
              <strong>You&apos;re ready for customers</strong>
              <small>Your booking site is fully set up. Keep the cards below tuned to the work you want visible.</small>
            </span>
            <ButtonLink href="/book" variant="secondary" size="sm">
              View booking page
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {renderedCards.length ? (
        <section className="dashboard-card-grid" aria-label="Pinned dashboard cards">
          {renderedCards.map(({ body, card, module: shellModule, placement }, index) => {
            const Icon = moduleIcons[shellModule.icon];

            return (
              <DashboardCardFrame
                description={card.description}
                footer={<DashboardCardControls card={card} index={index} placement={placement} total={renderedCards.length} />}
                href={shellModule.href}
                icon={<Icon size={18} />}
                key={placement.instanceId}
                size={placement.size}
                style={{ "--dashboard-card-span": cardSizeColumnSpan(placement.size) } as CSSProperties}
                title={card.title}
              >
                {body as ReactNode}
              </DashboardCardFrame>
            );
          })}
        </section>
      ) : (
        <Card as="section" minHeight="none">
          <EmptyState title="No dashboard cards yet" description="Add cards from your enabled modules to build this workspace." />
        </Card>
      )}

      <AddCardCatalog groups={catalogGroups} />
    </div>
  );
}
