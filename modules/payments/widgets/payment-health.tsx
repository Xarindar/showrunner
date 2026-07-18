import { DashboardCardList, DashboardMetric } from "@/components/ui";
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
  async render({ siteId, size, timezone }) {
    const limit = widgetItemLimit(size);
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
        <DashboardMetric detail={`${erroredCount} connections need attention`} label="Connected gateways" value={connectedCount} />
        {size !== "sm" ? (
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
