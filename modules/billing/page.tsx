import Link from "next/link";
import { BillingDocumentStatus, BillingDocumentType, PaymentStatus, Prisma } from "@prisma/client";
import { FileText, Plus, ReceiptText, WalletCards } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isRejectedCapturedPayment } from "@/lib/billing/payments";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  addBillingAttachmentAction,
  addBillingLineItemAction,
  clearBillingCheckoutLinkAction,
  createBillingDocumentAction,
  deleteBillingLineItemAction,
  queueBillingDocumentEmailAction,
  refundBillingPaymentAction,
  setBillingCheckoutLinkAction,
  updateBillingDocumentAction,
  updateBillingLineItemAction,
  updateBillingDocumentStatusAction } from "./actions";
import { Button, ButtonAnchor, Card, EqualGrid, Switch, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams: Promise<{saved?: string;error?: string;document?: string;}>;
};

function statusClass(status: BillingDocumentStatus) {
  if (status === BillingDocumentStatus.PAID || status === BillingDocumentStatus.ACCEPTED) return "ui-badge ui-badge-success";
  if (status === BillingDocumentStatus.VOID || status === BillingDocumentStatus.OVERDUE) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function dateInputValue(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function paymentTotalsLabel(payments: {amountCents: number;currency: string;refundedCents: number;}[]) {
  if (!payments.length) return formatMoney(0);
  const totals = new Map<string, number>();
  for (const payment of payments) {
    totals.set(payment.currency, (totals.get(payment.currency) || 0) + Math.max(0, payment.amountCents - payment.refundedCents));
  }

  return Array.from(totals.entries()).
  map(([currency, cents]) => formatMoney(cents, currency)).
  join(" / ");
}

function paidCents(payments: {amountCents: number;refundedCents?: number;status: PaymentStatus | string;}[]) {
  return payments.
  filter((payment) => payment.status === "PAID" || payment.status === "AUTHORIZED").
  reduce((sum, payment) => sum + Math.max(0, payment.amountCents - (payment.refundedCents || 0)), 0);
}

function refundablePaymentCents(payment: {
  amountCents: number;
  externalPaymentId: string | null;
  rawSummary: Prisma.JsonValue;
  refundedCents: number;
  status: PaymentStatus | string;
}) {
  if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.AUTHORIZED) {
    return Math.max(0, payment.amountCents - payment.refundedCents);
  }
  if (isRejectedCapturedPayment({ ...payment, status: payment.status as PaymentStatus })) {
    return payment.amountCents;
  }
  return 0;
}

function openBalanceTotalsLabel(documents: {
  currency: string;
  payments: {amountCents: number;refundedCents: number;status: string;}[];
  totalCents: number;
}[]) {
  const totals = new Map<string, number>();
  for (const document of documents) {
    const remainingCents = Math.max(0, document.totalCents - paidCents(document.payments));
    if (remainingCents > 0) {
      totals.set(document.currency, (totals.get(document.currency) || 0) + remainingCents);
    }
  }

  if (!totals.size) return formatMoney(0);
  return Array.from(totals.entries()).
  map(([currency, cents]) => formatMoney(cents, currency)).
  join(" / ");
}

function nextStatuses(status: BillingDocumentStatus) {
  const map: Record<BillingDocumentStatus, BillingDocumentStatus[]> = {
    [BillingDocumentStatus.DRAFT]: [BillingDocumentStatus.SENT, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.SENT]: [BillingDocumentStatus.ACCEPTED, BillingDocumentStatus.PAID, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.ACCEPTED]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.OVERDUE]: [BillingDocumentStatus.PAID, BillingDocumentStatus.VOID],
    [BillingDocumentStatus.PAID]: [],
    [BillingDocumentStatus.VOID]: []
  };

  return map[status];
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  await requireAdmin("billing:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);

  await prisma.billingDocument.updateMany({
    where: {
      siteId: settings.siteId,
      status: { in: [BillingDocumentStatus.SENT, BillingDocumentStatus.ACCEPTED] },
      dueAt: { lt: new Date() }
    },
    data: { status: BillingDocumentStatus.OVERDUE }
  });

  const [documents, clients, documentCount, paidTotals, openDocuments] = await Promise.all([
  prisma.billingDocument.findMany({
    where: { siteId: settings.siteId },
    include: {
      client: true,
      payments: true,
      _count: { select: { lineItems: true, attachments: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 25
  }),
  prisma.client.findMany({
    where: { siteId: settings.siteId },
    orderBy: { updatedAt: "desc" },
    take: 40
  }),
  prisma.billingDocument.count({ where: { siteId: settings.siteId } }),
  prisma.billingPayment.findMany({
    where: {
      billingDocument: { siteId: settings.siteId },
      status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] }
    },
    select: {
      amountCents: true,
      currency: true,
      refundedCents: true
    }
  }),
  prisma.billingDocument.findMany({
    where: { siteId: settings.siteId, status: { in: [BillingDocumentStatus.SENT, BillingDocumentStatus.ACCEPTED, BillingDocumentStatus.OVERDUE] } },
    select: {
      currency: true,
      totalCents: true,
      payments: {
        select: {
          amountCents: true,
          refundedCents: true,
          status: true
        }
      }
    }
  })]
  );

  const selectedDocumentId = params.document || documents[0]?.id;
  const selectedDocument = selectedDocumentId ?
  await prisma.billingDocument.findFirst({
    where: { id: selectedDocumentId, siteId: settings.siteId },
    include: {
      client: true,
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } }
    }
  }) :
  null;
  const savedMessage = params.saved ? "Billing changes saved." : null;
  const errorMessage = params.error || null;
  const selectedDocumentIsDraft = selectedDocument?.status === BillingDocumentStatus.DRAFT;
  const selectedDocumentIsFinal =
  selectedDocument?.status === BillingDocumentStatus.PAID || selectedDocument?.status === BillingDocumentStatus.VOID;
  const selectedPaidCents = selectedDocument ? paidCents(selectedDocument.payments) : 0;
  const selectedRemainingCents = selectedDocument ? Math.max(0, selectedDocument.totalCents - selectedPaidCents) : 0;
  const createDocumentForm = (
    <form action={createBillingDocumentAction} className="form-grid">
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="billing-type">Type</label>
          <select id="billing-type" name="type" defaultValue={BillingDocumentType.INVOICE}>
            {Object.values(BillingDocumentType).map((type) => (
              <option key={type} value={type}>
                {enumLabel(type)}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="billing-status">Status</label>
          <select id="billing-status" name="status" defaultValue={BillingDocumentStatus.DRAFT}>
            {[BillingDocumentStatus.DRAFT, BillingDocumentStatus.SENT].map((status) => (
              <option key={status} value={status}>
                {enumLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="billing-currency">Currency</label>
          <input id="billing-currency" name="currency" defaultValue="USD" maxLength={3} required />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="billing-client">Client</label>
          <select id="billing-client" name="clientId" defaultValue="">
            <option value="">No linked client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.email})
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="billing-due">Due date</label>
          <input id="billing-due" name="dueAt" type="date" />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="billing-name">Customer name</label>
          <input id="billing-name" name="customerName" required />
        </div>
        <div className="ui-field">
          <label htmlFor="billing-email">Customer email</label>
          <input id="billing-email" name="customerEmail" type="email" required />
        </div>
      </EqualGrid>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="line-description">First line item</label>
          <input id="line-description" name="lineDescription" required />
        </div>
        <div className="ui-field">
          <label htmlFor="line-quantity">Quantity</label>
          <input id="line-quantity" name="quantity" type="number" min="1" defaultValue="1" required />
        </div>
        <div className="ui-field">
          <label htmlFor="line-price">Unit price</label>
          <input id="line-price" name="unitPrice" inputMode="decimal" placeholder="250.00" required />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="billing-discount">Discount</label>
          <input id="billing-discount" name="discount" inputMode="decimal" />
        </div>
        <div className="ui-field">
          <label htmlFor="billing-tax">Tax</label>
          <input id="billing-tax" name="tax" inputMode="decimal" />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="billing-memo">Customer memo</label>
        <textarea id="billing-memo" name="publicMemo" />
      </div>
      <div className="ui-field">
        <label htmlFor="billing-notes">Internal notes</label>
        <textarea id="billing-notes" name="notes" />
      </div>
      <div className="module-modal-actions">
        <Button type="submit">
          <Plus size={18} />
          Create document
        </Button>
      </div>
    </form>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Quotes, invoices, and documents</h1>
          <p>Create billing records, compute totals server-side, attach documents, and track status through paid or accepted.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <ReceiptText size={22} />
          <h3>{documentCount} documents</h3>
          <p className="lead lead-compact">
            Quotes, invoices, and contracts in the billing workspace.
          </p>
        </Card>
        <Card>
          <WalletCards size={22} />
          <h3>{paymentTotalsLabel(paidTotals)}</h3>
          <p className="lead lead-compact">
            Total marked paid across all billing records.
          </p>
        </Card>
        <Card>
          <FileText size={22} />
          <h3>{openBalanceTotalsLabel(openDocuments)}</h3>
          <p className="lead lead-compact">
            Sent, accepted, and overdue documents still open.
          </p>
        </Card>
      </EqualGrid>

      <Card as="section" bodyClassName="ui-stack">
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Billing queue</h2>
            </div>
            <ModuleActionModals
              items={[
                {
                  content: createDocumentForm,
                  icon: "receipt",
                  id: "create",
                  label: "Create",
                  title: "Create billing document",
                  variant: "primary"
                }
              ]}
              toolbarLabel="Billing tools"
            />
          </div>
          <Table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Customer</th>
                <th>Total</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) =>
              <tr key={document.id}>
                  <td>
                    <Link href={`/admin/modules/billing?document=${document.id}`}>{document.documentNumber}</Link>
                    <br />
                    <span className="muted-text">
                      {enumLabel(document.type)} - {document._count.lineItems} lines - {document._count.attachments} files
                    </span>
                  </td>
                  <td>
                    <strong>{document.customerName}</strong>
                    <br />
                    <span className="muted-text">{document.customerEmail}</span>
                  </td>
                  <td>
                    {formatMoney(document.totalCents, document.currency)}
                    {paidCents(document.payments) > 0 ?
                  <>
                        <br />
                        <span className="muted-text">
                          {formatMoney(Math.max(0, document.totalCents - paidCents(document.payments)), document.currency)} due
                        </span>
                      </> :
                  null}
                  </td>
                  <td>
                    <span className={statusClass(document.status)}>{enumLabel(document.status)}</span>
                  </td>
                </tr>
              )}
              {!documents.length ?
              <tr>
                  <td colSpan={4}>No billing documents yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>

      {selectedDocument ?
      <EqualGrid as="section">
          <Card bodyClassName="ui-stack">
            <div className="page-header compact-header">
              <div>
                <h2 className="section-title">{selectedDocument.documentNumber}</h2>
                <p>
                  {enumLabel(selectedDocument.type)} for {selectedDocument.customerName}
                </p>
              </div>
              <span className={statusClass(selectedDocument.status)}>{enumLabel(selectedDocument.status)}</span>
            </div>
            <Table>
              <tbody>
                <tr>
                  <td>Subtotal</td>
                  <td>{formatMoney(selectedDocument.subtotalCents, selectedDocument.currency)}</td>
                </tr>
                <tr>
                  <td>Discount</td>
                  <td>{formatMoney(selectedDocument.discountCents, selectedDocument.currency)}</td>
                </tr>
                <tr>
                  <td>Tax</td>
                  <td>{formatMoney(selectedDocument.taxCents, selectedDocument.currency)}</td>
                </tr>
                <tr>
                  <td>Total</td>
                  <td>
                    <strong>{formatMoney(selectedDocument.totalCents, selectedDocument.currency)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Paid</td>
                  <td>{formatMoney(selectedPaidCents, selectedDocument.currency)}</td>
                </tr>
                <tr>
                  <td>Remaining</td>
                  <td>
                    <strong>{formatMoney(selectedRemainingCents, selectedDocument.currency)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Due</td>
                  <td>{selectedDocument.dueAt ? formatDateTime(selectedDocument.dueAt, settings.timezone) : "No due date"}</td>
                </tr>
              </tbody>
            </Table>
            <div className="ui-zero">
              {nextStatuses(selectedDocument.status).map((status) =>
            <form action={updateBillingDocumentStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedDocument.id} />
                  <input type="hidden" name="status" value={status} />
                  <Button type="submit" variant="secondary">
                    Mark {enumLabel(status)}
                  </Button>
                </form>
            )}
              {!nextStatuses(selectedDocument.status).length ?
            <span className="ui-badge">Final state</span> :
            null}
            </div>
            <div className="subpanel form-grid">
              <h3 className="subsection-title">Client link and payment handoff</h3>
              <EqualGrid>
                <div>
                  <p className="ui-zero">Public document</p>
                  {selectedDocument.publicAccessToken && !selectedDocumentIsDraft ?
                <ButtonAnchor href={`/billing/${selectedDocument.publicAccessToken}`} target="_blank" rel="noreferrer" variant="secondary">
                      Open client view
                    </ButtonAnchor> :

                <span className="ui-badge">Available after send</span>
                }
                </div>
                <div>
                  <p className="ui-zero">Customer notice</p>
                  {!selectedDocumentIsDraft ?
                <form action={queueBillingDocumentEmailAction}>
                      <input type="hidden" name="id" value={selectedDocument.id} />
                      <Button type="submit" variant="secondary">
                        Queue email
                      </Button>
                    </form> :

                <span className="ui-badge">Send first</span>
                }
                </div>
              </EqualGrid>
              <div className="subpanel form-grid">
                <div className="page-header flush-header">
                  <div>
                    <h3 className="subsection-title">Stripe Checkout link</h3>
                    <p>
                      {selectedDocument.checkoutUrl ?
                    "Hosted payment link is attached." :
                    "No hosted payment link is attached."}
                    </p>
                  </div>
                  {selectedDocument.checkoutUrl ?
                <ButtonAnchor href={selectedDocument.checkoutUrl} target="_blank" rel="noreferrer" variant="secondary">
                      Open link
                    </ButtonAnchor> :
                null}
                </div>
                {!selectedDocumentIsDraft && !selectedDocumentIsFinal ?
              <form action={setBillingCheckoutLinkAction} className="form-grid">
                    <input type="hidden" name="id" value={selectedDocument.id} />
                    <EqualGrid>
                      <div className="ui-field">
                        <label htmlFor={`billing-${selectedDocument.id}-checkout`}>Stripe Checkout URL</label>
                        <input
                      id={`billing-${selectedDocument.id}-checkout`}
                      name="checkoutUrl"
                      placeholder="https://checkout.stripe.com/..."
                      defaultValue={selectedDocument.checkoutUrl}
                      required />
                    
                      </div>
                      <div className="ui-field">
                        <label htmlFor={`billing-${selectedDocument.id}-payment-ref`}>Stripe reference</label>
                        <input
                      id={`billing-${selectedDocument.id}-payment-ref`}
                      name="paymentExternalReference"
                      placeholder="cs_test_..."
                      defaultValue={selectedDocument.paymentExternalReference} />
                    
                      </div>
                    </EqualGrid>
                    <Button type="submit" variant="secondary">
                      Save hosted payment link
                    </Button>
                  </form> :
              null}
                {selectedDocument.checkoutUrl && !selectedDocumentIsFinal ?
              <form action={clearBillingCheckoutLinkAction} className="form-grid">
                    <input type="hidden" name="id" value={selectedDocument.id} />
                    <Switch label="Clear this hosted payment link." name="confirmClear" required variant="inline" />
                    <Button type="submit" variant="danger">
                      Clear payment link
                    </Button>
                  </form> :
              null}
              </div>
            </div>
            {selectedDocument.payments.length ?
          <div className="subpanel">
                <h3 className="subsection-title">Payment history</h3>
                <Table tableClassName="ui-zero">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Created</th>
                      <th>Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDocument.payments.map((payment) => {
                  const refundableCents = refundablePaymentCents(payment);

                  return (
                    <tr key={payment.id}>
                          <td>{enumLabel(payment.status)}</td>
                          <td>
                            {formatMoney(payment.amountCents, payment.currency)}
                            {payment.refundedCents > 0 ?
                        <>
                                <br />
                                <span className="muted-text">{formatMoney(payment.refundedCents, payment.currency)} refunded</span>
                              </> :
                        null}
                          </td>
                          <td>{formatDateTime(payment.createdAt, settings.timezone)}</td>
                          <td>
                            {refundableCents > 0 ?
                        <form action={refundBillingPaymentAction} className="form-grid ui-zero">
                                <input type="hidden" name="paymentId" value={payment.id} />
                                <div className="ui-field">
                                  <label htmlFor={`billing-refund-${payment.id}`}>Amount</label>
                                  <input
                              id={`billing-refund-${payment.id}`}
                              name="amount"
                              defaultValue={moneyInput(refundableCents)}
                              inputMode="decimal"
                              required />
                            
                                </div>
                                <Button type="submit" variant="danger">
                                  Refund
                                </Button>
                              </form> :

                        <span className="ui-badge">Not refundable</span>
                        }
                          </td>
                        </tr>);

                })}
                  </tbody>
                </Table>
              </div> :
          null}
            {selectedDocumentIsDraft ?
          <form action={updateBillingDocumentAction} className="subpanel form-grid">
                <h3 className="subsection-title">Edit draft details</h3>
                <input type="hidden" name="id" value={selectedDocument.id} />
                <EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-client`}>Client</label>
                    <select id={`billing-${selectedDocument.id}-client`} name="clientId" defaultValue={selectedDocument.clientId || ""}>
                      <option value="">No linked client</option>
                      {clients.map((client) =>
                  <option key={client.id} value={client.id}>
                          {client.name} ({client.email})
                        </option>
                  )}
                    </select>
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-currency`}>Currency</label>
                    <input
                  id={`billing-${selectedDocument.id}-currency`}
                  name="currency"
                  defaultValue={selectedDocument.currency}
                  maxLength={3}
                  required />
                
                  </div>
                </EqualGrid>
                <EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-name`}>Customer name</label>
                    <input id={`billing-${selectedDocument.id}-name`} name="customerName" defaultValue={selectedDocument.customerName} required />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-email`}>Customer email</label>
                    <input
                  id={`billing-${selectedDocument.id}-email`}
                  name="customerEmail"
                  type="email"
                  defaultValue={selectedDocument.customerEmail}
                  required />
                
                  </div>
                </EqualGrid>
                <EqualGrid min="220px">
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-due`}>Due date</label>
                    <input id={`billing-${selectedDocument.id}-due`} name="dueAt" type="date" defaultValue={dateInputValue(selectedDocument.dueAt)} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-discount`}>Discount</label>
                    <input id={`billing-${selectedDocument.id}-discount`} name="discount" inputMode="decimal" defaultValue={moneyInput(selectedDocument.discountCents)} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`billing-${selectedDocument.id}-tax`}>Tax</label>
                    <input id={`billing-${selectedDocument.id}-tax`} name="tax" inputMode="decimal" defaultValue={moneyInput(selectedDocument.taxCents)} />
                  </div>
                </EqualGrid>
                <div className="ui-field">
                  <label htmlFor={`billing-${selectedDocument.id}-memo`}>Customer memo</label>
                  <textarea id={`billing-${selectedDocument.id}-memo`} name="publicMemo" defaultValue={selectedDocument.publicMemo} />
                </div>
                <div className="ui-field">
                  <label htmlFor={`billing-${selectedDocument.id}-notes`}>Internal notes</label>
                  <textarea id={`billing-${selectedDocument.id}-notes`} name="notes" defaultValue={selectedDocument.notes} />
                </div>
                <Button type="submit" variant="secondary">
                  Save draft details
                </Button>
              </form> :

          <p className="ui-zero">Finalized documents are locked. Create a replacement or void the document when a correction is needed.</p>
          }
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Line items</h2>
            <Table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedDocument.lineItems.map((item) =>
              <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.lineTotalCents, selectedDocument.currency)}</td>
                    <td>
                      {selectedDocumentIsDraft ?
                  <details>
                          <summary>Edit</summary>
                          <form action={updateBillingLineItemAction} className="form-grid ui-zero">
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                            <div className="ui-field">
                              <label htmlFor={`line-${item.id}-description`}>Description</label>
                              <input id={`line-${item.id}-description`} name="description" defaultValue={item.description} required />
                            </div>
                            <EqualGrid min="220px">
                              <div className="ui-field">
                                <label htmlFor={`line-${item.id}-quantity`}>Qty</label>
                                <input id={`line-${item.id}-quantity`} name="quantity" type="number" min="1" defaultValue={item.quantity} required />
                              </div>
                              <div className="ui-field">
                                <label htmlFor={`line-${item.id}-price`}>Unit price</label>
                                <input id={`line-${item.id}-price`} name="unitPrice" inputMode="decimal" defaultValue={moneyInput(item.unitPriceCents)} required />
                              </div>
                              <div className="ui-field">
                                <label htmlFor={`line-${item.id}-sort`}>Sort</label>
                                <input id={`line-${item.id}-sort`} name="sortOrder" type="number" defaultValue={item.sortOrder} />
                              </div>
                            </EqualGrid>
                            <Button type="submit" variant="secondary">
                              Save line
                            </Button>
                          </form>
                          <form action={deleteBillingLineItemAction} className="form-grid ui-zero">
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                            <Switch label="Delete this line item." name="confirmDelete" required variant="inline" />
                            <Button type="submit" variant="danger">
                              Delete line
                            </Button>
                          </form>
                        </details> :

                  <span className="ui-badge">Locked</span>
                  }
                    </td>
                  </tr>
              )}
              </tbody>
            </Table>
            {selectedDocumentIsDraft ?
          <form action={addBillingLineItemAction} className="subpanel form-grid">
                <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                <EqualGrid min="220px">
                  <div className="ui-field">
                    <label htmlFor="new-line-description">Description</label>
                    <input id="new-line-description" name="description" required />
                  </div>
                  <div className="ui-field">
                    <label htmlFor="new-line-quantity">Quantity</label>
                    <input id="new-line-quantity" name="quantity" type="number" min="1" defaultValue="1" required />
                  </div>
                  <div className="ui-field">
                    <label htmlFor="new-line-price">Unit price</label>
                    <input id="new-line-price" name="unitPrice" inputMode="decimal" required />
                  </div>
                </EqualGrid>
                <Button type="submit" variant="secondary">
                  Add line item
                </Button>
              </form> :
          null}
          </Card>
        </EqualGrid> :
      null}

      {selectedDocument ?
      <EqualGrid as="section">
          {selectedDocumentIsDraft ?
        <Card action={addBillingAttachmentAction} as="form" minHeight="none" bodyClassName="form-grid">
              <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
              <h2 className="section-title">Attach document</h2>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="attachment-title">Title</label>
                  <input id="attachment-title" name="title" required />
                </div>
                <div className="ui-field">
                  <label htmlFor="attachment-url">URL</label>
                  <input id="attachment-url" name="url" placeholder="https://example.com/file.pdf" required />
                </div>
              </EqualGrid>
              <div className="ui-field">
                <label htmlFor="attachment-notes">Notes</label>
                <input id="attachment-notes" name="notes" />
              </div>
              <Button type="submit" variant="secondary">
                Attach file
              </Button>
            </Card> :

        <Card>
              <h2 className="section-title">Attach document</h2>
              <p className="ui-zero">Attachments are locked once the document leaves draft.</p>
            </Card>
        }

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Attachments</h2>
            <Table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>URL</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {selectedDocument.attachments.map((attachment) =>
              <tr key={attachment.id}>
                    <td>
                      <strong>{attachment.title}</strong>
                      <br />
                      <span className="muted-text">{attachment.notes || "No notes"}</span>
                    </td>
                    <td>{attachment.url}</td>
                    <td>{formatDateTime(attachment.createdAt, settings.timezone)}</td>
                  </tr>
              )}
                {!selectedDocument.attachments.length ?
              <tr>
                    <td colSpan={3}>No attachments yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}
    </div>);

}
