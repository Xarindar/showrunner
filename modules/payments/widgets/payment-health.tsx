import { DashboardCardList, DashboardRing } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const paymentHealthWidget = {
  defaultSize: "md",
  description: "Gateway health and recent payment activity.",
  id: "payments.health",
  moduleId: "payments",
  sizes: ["sm", "md", "lg"],
  title: "Payment health",
  async render({ preview, siteId, size, timezone }) {
    if (preview) {
      return <DashboardRing detail="All configured gateways are healthy" label="Gateway health" max={2} tone="positive" value={2} />;
    }

    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [connectedCount, erroredCount, payments] = await Promise.all([
      prisma.paymentGatewayCredential.count({ where: { siteId, status: "CONNECTED" } }),
      prisma.paymentGatewayCredential.count({ where: { siteId, status: "ERROR" } }),
      prisma.payment.findMany({
        include: { order: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        where: { order: { siteId } }
      })
    ]);

    return (
      <>
        <DashboardRing
          detail={erroredCount ? `${erroredCount} connection${erroredCount === 1 ? "" : "s"} need attention` : "All configured gateways are healthy"}
          label="Gateway health"
          max={Math.max(1, connectedCount + erroredCount)}
          tone={erroredCount ? "attention" : "positive"}
          value={connectedCount}
        />
        {size === "lg" ? (
          <DashboardCardList
            empty="No payments have been recorded yet."
            items={payments.map((payment) => ({
              detail: `${payment.order.orderNumber} · ${formatMoney(payment.amountCents, payment.currency)}`,
              id: payment.id,
              meta: widgetShortDateLabel(payment.createdAt, timezone),
              title: payment.provider.toLowerCase()
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
