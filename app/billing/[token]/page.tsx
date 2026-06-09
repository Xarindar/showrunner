import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingDocumentStatus, BillingDocumentType } from "@prisma/client";
import { CheckCircle, CreditCard, FileText, Printer } from "lucide-react";
import { acceptPublicBillingDocumentAction } from "./actions";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

type BillingDocumentPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accepted?: string; error?: string }>;
};

function statusClass(status: BillingDocumentStatus) {
  if (status === BillingDocumentStatus.PAID || status === BillingDocumentStatus.ACCEPTED) return "pill success";
  if (status === BillingDocumentStatus.VOID || status === BillingDocumentStatus.OVERDUE) return "pill danger";
  return "pill";
}

function canAccept(type: BillingDocumentType, status: BillingDocumentStatus) {
  return type !== BillingDocumentType.INVOICE && (status === BillingDocumentStatus.SENT || status === BillingDocumentStatus.OVERDUE);
}

function canPay(type: BillingDocumentType, status: BillingDocumentStatus) {
  return (
    type === BillingDocumentType.INVOICE &&
    (status === BillingDocumentStatus.SENT ||
      status === BillingDocumentStatus.ACCEPTED ||
      status === BillingDocumentStatus.OVERDUE)
  );
}

export default async function BillingDocumentPage({ params, searchParams }: BillingDocumentPageProps) {
  const [{ token }, query, settings] = await Promise.all([params, searchParams, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("billing")) notFound();

  const document = await prisma.billingDocument.findUnique({
    where: { siteId_publicAccessToken: { siteId: settings.siteId, publicAccessToken: token } },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!document || document.status === BillingDocumentStatus.DRAFT) notFound();

  const payable = canPay(document.type, document.status);
  const acceptable = canAccept(document.type, document.status);

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href={`/billing/${token}/print`} className="button secondary">
            <Printer size={18} />
            Print
          </Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="stack">
          {query.accepted ? <div className="success-message">Document accepted.</div> : null}
          {query.error ? <div className="error">{query.error}</div> : null}

          <div className="card stack">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div>
                <p className="eyebrow">{enumLabel(document.type)}</p>
                <h1 style={{ fontSize: "2.35rem" }}>{document.documentNumber}</h1>
                <p>
                  Prepared for {document.customerName} by {settings.businessName}
                </p>
              </div>
              <span className={statusClass(document.status)}>{enumLabel(document.status)}</span>
            </div>

            <div className="grid-3">
              <div className="subpanel">
                <FileText size={20} />
                <h3>Total</h3>
                <p>{formatMoney(document.totalCents, document.currency)}</p>
              </div>
              <div className="subpanel">
                <CheckCircle size={20} />
                <h3>Accepted</h3>
                <p>{document.acceptedAt ? formatDateTime(document.acceptedAt, settings.timezone) : "Not accepted"}</p>
              </div>
              <div className="subpanel">
                <CreditCard size={20} />
                <h3>Payment</h3>
                <p>{document.paidAt ? formatDateTime(document.paidAt, settings.timezone) : "Hosted checkout only"}</p>
              </div>
            </div>

            {document.publicMemo ? <p className="lead">{document.publicMemo}</p> : null}

            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {document.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.unitPriceCents, document.currency)}</td>
                    <td>{formatMoney(item.lineTotalCents, document.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid-2">
              <div className="subpanel">
                <h3>Summary</h3>
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <td>Subtotal</td>
                      <td>{formatMoney(document.subtotalCents, document.currency)}</td>
                    </tr>
                    <tr>
                      <td>Discount</td>
                      <td>{formatMoney(document.discountCents, document.currency)}</td>
                    </tr>
                    <tr>
                      <td>Tax</td>
                      <td>{formatMoney(document.taxCents, document.currency)}</td>
                    </tr>
                    <tr>
                      <td>Total</td>
                      <td>
                        <strong>{formatMoney(document.totalCents, document.currency)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="subpanel form-grid">
                <h3>Actions</h3>
                {acceptable ? (
                  <form action={acceptPublicBillingDocumentAction}>
                    <input type="hidden" name="token" value={token} />
                    <button className="button" type="submit">
                      <CheckCircle size={18} />
                      Accept document
                    </button>
                  </form>
                ) : null}
                {payable && document.checkoutUrl ? (
                  <a className="button" href={document.checkoutUrl}>
                    <CreditCard size={18} />
                    Pay with Stripe Checkout
                  </a>
                ) : null}
                {payable && !document.checkoutUrl ? <span className="pill">Payment link pending</span> : null}
                {!acceptable && !payable ? <span className="pill">No action needed</span> : null}
                <Link className="button secondary" href={`/billing/${token}/print`}>
                  <Printer size={18} />
                  Print or save PDF
                </Link>
              </div>
            </div>

            {document.attachments.length ? (
              <div className="subpanel">
                <h3>Attachments</h3>
                <div className="stack">
                  {document.attachments.map((attachment) => (
                    <a href={attachment.url} key={attachment.id} target="_blank" rel="noreferrer">
                      {attachment.title}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
