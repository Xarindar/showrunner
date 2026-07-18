import { Badge, DashboardCardList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit } from "@/shell/dashboard-widget-utils";

export const commerceOrdersWidget = {
  defaultSize: "md",
  description: "Product readiness and recent order flow.",
  id: "products.orders",
  moduleId: "products",
  sizes: ["sm", "md", "lg"],
  title: "Commerce orders",
  async render({ preview, siteId, size }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="12 active products, 3 pending orders" label="Paid revenue" value="$8,420.00" />
          <DashboardSegmentBar
            items={[
              { label: "Products", tone: "positive", value: 12 },
              { label: "Orders to review", tone: "attention", value: 3 }
            ]}
          />
        </>
      );
    }

    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [activeProducts, pendingOrders, paidRevenue, orders] = await Promise.all([
      prisma.product.count({ where: { siteId, status: "ACTIVE" } }),
      prisma.order.count({ where: { siteId, status: "PENDING" } }),
      prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { siteId, status: { in: ["PAID", "FULFILLED"] } }
      }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        where: { siteId }
      })
    ]);

    return (
      <>
        <DashboardMetric
          detail={`${activeProducts} active products, ${pendingOrders} pending orders`}
          label="Paid revenue"
          value={formatMoney(paidRevenue._sum.totalCents || 0)}
        />
        <DashboardSegmentBar
          items={[
            { label: "Products", tone: "positive", value: activeProducts },
            { label: "Orders to review", tone: "attention", value: pendingOrders }
          ]}
        />
        {size === "lg" ? (
          <DashboardCardList
            empty="No orders have been created yet."
            items={orders.map((order) => ({
              detail: `${order.customerName} · ${formatMoney(order.totalCents, order.currency)}`,
              id: order.id,
              meta: <Badge>{order.status.toLowerCase()}</Badge>,
              title: order.orderNumber
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
