import { notFound } from "next/navigation";
import { BillingDocumentStatus } from "@prisma/client";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

type BillingPrintPageProps = {
  params: Promise<{ token: string }>;
};

export default async function BillingPrintPage({ params }: BillingPrintPageProps) {
  const [{ token }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("billing")) notFound();

  const document = await prisma.billingDocument.findUnique({
    where: { publicAccessToken: token },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!document || document.status === BillingDocumentStatus.DRAFT) notFound();

  return (
    <main style={{ background: "white", color: "#111", minHeight: "100vh", padding: 32 }}>
      <style>
        {`
          @media print {
            body { background: white !important; }
            a { color: inherit; text-decoration: none; }
          }
        `}
      </style>
      <section style={{ margin: "0 auto", maxWidth: 860 }}>
        <header style={{ borderBottom: "1px solid #ddd", marginBottom: 28, paddingBottom: 22 }}>
          <p style={{ fontWeight: 700, letterSpacing: 0, margin: 0, textTransform: "uppercase" }}>{enumLabel(document.type)}</p>
          <h1 style={{ fontSize: 40, margin: "8px 0" }}>{document.documentNumber}</h1>
          <p style={{ margin: 0 }}>
            {settings.businessName} - {document.customerName} - {enumLabel(document.status)}
          </p>
        </header>

        <table style={{ borderCollapse: "collapse", marginBottom: 28, width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ padding: "8px 0" }}>Customer email</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{document.customerEmail}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 0" }}>Due</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>
                {document.dueAt ? formatDateTime(document.dueAt, settings.timezone) : "No due date"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "8px 0" }}>Accepted</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>
                {document.acceptedAt ? formatDateTime(document.acceptedAt, settings.timezone) : "Not accepted"}
              </td>
            </tr>
          </tbody>
        </table>

        {document.publicMemo ? <p style={{ lineHeight: 1.6, marginBottom: 28 }}>{document.publicMemo}</p> : null}

        <table style={{ borderCollapse: "collapse", marginBottom: 28, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ borderBottom: "1px solid #ddd", padding: "10px 0", textAlign: "left" }}>Description</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: "10px 0", textAlign: "right" }}>Qty</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: "10px 0", textAlign: "right" }}>Unit</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: "10px 0", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((item) => (
              <tr key={item.id}>
                <td style={{ borderBottom: "1px solid #eee", padding: "12px 0" }}>{item.description}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "12px 0", textAlign: "right" }}>{item.quantity}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "12px 0", textAlign: "right" }}>
                  {formatMoney(item.unitPriceCents, document.currency)}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "12px 0", textAlign: "right" }}>
                  {formatMoney(item.lineTotalCents, document.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table style={{ borderCollapse: "collapse", marginLeft: "auto", width: 320 }}>
          <tbody>
            <tr>
              <td style={{ padding: "8px 0" }}>Subtotal</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{formatMoney(document.subtotalCents, document.currency)}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 0" }}>Discount</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{formatMoney(document.discountCents, document.currency)}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 0" }}>Tax</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{formatMoney(document.taxCents, document.currency)}</td>
            </tr>
            <tr>
              <td style={{ borderTop: "1px solid #222", fontWeight: 700, padding: "12px 0" }}>Total</td>
              <td style={{ borderTop: "1px solid #222", fontWeight: 700, padding: "12px 0", textAlign: "right" }}>
                {formatMoney(document.totalCents, document.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
