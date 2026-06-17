import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingDocumentStatus, BillingDocumentType } from "@prisma/client";
import { CheckCircle, CreditCard, FileText, Printer } from "lucide-react";
import { acceptPublicBillingDocumentAction, createPublicBillingCheckoutAction } from "./actions";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

type BillingDocumentPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accepted?: string; checkout?: string; error?: string }>;
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
  return type !== BillingDocumentType.CONTRACT && (status === BillingDocumentStatus.SENT || status === BillingDocumentStatus.ACCEPTED || status === BillingDocumentStatus.OVERDUE);
}

function paymentAmountInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export default async function BillingDocumentPage({ params, searchParams }: BillingDocumentPageProps) {
  const [{ token }, query, settings] = await Promise.all([params, searchParams, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("billing")) notFound();

  const document = await prisma.billingDocument.findUnique({
    where: { siteId_publicAccessToken: { siteId: settings.siteId, publicAccessToken: token } },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!document || document.status === BillingDocumentStatus.DRAFT) notFound();

  const payable = canPay(document.type, document.status);
  const acceptable = canAccept(document.type, document.status);
  const paidCents = document.payments
    .filter((payment) => payment.status === "PAID" || payment.status === "AUTHORIZED")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, document.totalCents - paidCents);

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
          <Link href={`/billing/${token}/pdf`} className="button secondary">
            <FileText size={18} />
            PDF
          </Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="stack">
          {query.accepted ? <div className="success-message">Document accepted.</div> : null}
          {query.checkout === "success" ? <div className="success-message">Payment received. Your balance is updated below.</div> : null}
          {query.checkout === "cancel" ? <div className="error">Payment was canceled before completion.</div> : null}
          {query.error ? <div className="error">{query.error}</div> : null}

          <div className="card stack">
            <div className="page-header flush-header">
              <div>
                <p className="eyebrow">{enumLabel(document.type)}</p>
                <h1>{document.documentNumber}</h1>
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
                <h3>Balance</h3>
                <p>{formatMoney(remainingCents, document.currency)} remaining</p>
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
                    <tr>
                      <td>Paid</td>
                      <td>{formatMoney(paidCents, document.currency)}</td>
                    </tr>
                    <tr>
                      <td>Remaining</td>
                      <td>
                        <strong>{formatMoney(remainingCents, document.currency)}</strong>
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
                {payable && remainingCents > 0 ? (
                  <form action={createPublicBillingCheckoutAction} className="form-grid">
                    <input type="hidden" name="token" value={token} />
                    <div className="field">
                      <label htmlFor="billing-payment-amount">Payment amount</label>
                      <input
                        id="billing-payment-amount"
                        name="amount"
                        inputMode="decimal"
                        defaultValue={paymentAmountInput(remainingCents)}
                        required
                      />
                    </div>
                    <button className="button" type="submit">
                      <CreditCard size={18} />
                      Pay with Stripe Checkout
                    </button>
                  </form>
                ) : null}
                {payable && document.checkoutUrl && remainingCents > 0 ? (
                  <a className="button secondary" href={document.checkoutUrl}>
                    <CreditCard size={18} />
                    Resume latest checkout
                  </a>
                ) : null}
                {payable && remainingCents <= 0 ? <span className="pill success">Paid in full</span> : null}
                {!acceptable && !payable ? <span className="pill">No action needed</span> : null}
                <Link className="button secondary" href={`/billing/${token}/print`}>
                  <Printer size={18} />
                  Print or save PDF
                </Link>
                <Link className="button secondary" href={`/billing/${token}/pdf`}>
                  <FileText size={18} />
                  Download PDF
                </Link>
              </div>
            </div>

            {document.payments.length ? (
              <div className="subpanel">
                <h3>Payment history</h3>
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    {document.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{enumLabel(payment.status)}</td>
                        <td>{formatMoney(payment.amountCents, payment.currency)}</td>
                        <td>{formatDateTime(payment.createdAt, settings.timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

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
