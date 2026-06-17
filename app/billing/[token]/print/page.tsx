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
    where: { siteId_publicAccessToken: { siteId: settings.siteId, publicAccessToken: token } },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!document || document.status === BillingDocumentStatus.DRAFT) notFound();
  const paidCents = document.payments
    .filter((payment) => payment.status === "PAID" || payment.status === "AUTHORIZED")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, document.totalCents - paidCents);

  return (
    <main className="ui-zero">
      <style>
        {`
          @media print {
            body { background: white !important; }
            a { color: inherit; text-decoration: none; }
          }
        `}
      </style>
      <section className="ui-zero">
        <header className="ui-zero">
          <p className="ui-zero">{enumLabel(document.type)}</p>
          <h1 className="ui-zero">{document.documentNumber}</h1>
          <p className="ui-zero">
            {settings.businessName} - {document.customerName} - {enumLabel(document.status)}
          </p>
        </header>

        <table className="ui-zero">
          <tbody>
            <tr>
              <td className="ui-zero">Customer email</td>
              <td className="ui-zero">{document.customerEmail}</td>
            </tr>
            <tr>
              <td className="ui-zero">Due</td>
              <td className="ui-zero">
                {document.dueAt ? formatDateTime(document.dueAt, settings.timezone) : "No due date"}
              </td>
            </tr>
            <tr>
              <td className="ui-zero">Accepted</td>
              <td className="ui-zero">
                {document.acceptedAt ? formatDateTime(document.acceptedAt, settings.timezone) : "Not accepted"}
              </td>
            </tr>
          </tbody>
        </table>

        {document.publicMemo ? <p className="ui-zero">{document.publicMemo}</p> : null}

        <table className="ui-zero">
          <thead>
            <tr>
              <th className="ui-zero">Description</th>
              <th className="ui-zero">Qty</th>
              <th className="ui-zero">Unit</th>
              <th className="ui-zero">Total</th>
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((item) => (
              <tr key={item.id}>
                <td className="ui-zero">{item.description}</td>
                <td className="ui-zero">{item.quantity}</td>
                <td className="ui-zero">
                  {formatMoney(item.unitPriceCents, document.currency)}
                </td>
                <td className="ui-zero">
                  {formatMoney(item.lineTotalCents, document.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="ui-zero">
          <tbody>
            <tr>
              <td className="ui-zero">Subtotal</td>
              <td className="ui-zero">{formatMoney(document.subtotalCents, document.currency)}</td>
            </tr>
            <tr>
              <td className="ui-zero">Discount</td>
              <td className="ui-zero">{formatMoney(document.discountCents, document.currency)}</td>
            </tr>
            <tr>
              <td className="ui-zero">Tax</td>
              <td className="ui-zero">{formatMoney(document.taxCents, document.currency)}</td>
            </tr>
            <tr>
              <td className="ui-zero">Total</td>
              <td className="ui-zero">
                {formatMoney(document.totalCents, document.currency)}
              </td>
            </tr>
            <tr>
              <td className="ui-zero">Paid</td>
              <td className="ui-zero">{formatMoney(paidCents, document.currency)}</td>
            </tr>
            <tr>
              <td className="ui-zero">Remaining</td>
              <td className="ui-zero">{formatMoney(remainingCents, document.currency)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
