import { Badge, DashboardCardList, DashboardMetric } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const billingDeskWidget = {
  defaultSize: "md",
  description: "Open invoice value and documents needing attention.",
  id: "billing.desk",
  moduleId: "billing",
  sizes: ["sm", "md", "lg"],
  title: "Billing desk",
  async render({ siteId, size, timezone }) {
    const limit = widgetItemLimit(size);
    const [sentCount, overdueCount, openTotal, documents] = await Promise.all([
      prisma.billingDocument.count({ where: { siteId, type: "INVOICE", status: "SENT" } }),
      prisma.billingDocument.count({ where: { siteId, type: "INVOICE", status: "OVERDUE" } }),
      prisma.billingDocument.aggregate({
        _sum: { totalCents: true },
        where: { siteId, type: "INVOICE", status: { in: ["SENT", "OVERDUE"] } }
      }),
      prisma.billingDocument.findMany({
        orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
        take: limit,
        where: { siteId, type: "INVOICE", status: { in: ["SENT", "OVERDUE"] } }
      })
    ]);

    return (
      <>
        <DashboardMetric
          detail={`${sentCount} sent, ${overdueCount} overdue`}
          label="Open invoice total"
          value={formatMoney(openTotal._sum.totalCents || 0)}
        />
        {size !== "sm" ? (
          <DashboardCardList
            empty="No invoices are currently open."
            items={documents.map((document) => ({
              detail: `${document.customerName} · ${formatMoney(document.totalCents, document.currency)}`,
              id: document.id,
              meta: document.dueAt ? widgetShortDateLabel(document.dueAt, timezone) : <Badge>{document.status.toLowerCase()}</Badge>,
              title: document.documentNumber
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
