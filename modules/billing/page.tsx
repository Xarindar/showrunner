import Link from "next/link";
import { BillingDocumentStatus, BillingDocumentType } from "@prisma/client";
import { FileText, Plus, ReceiptText, WalletCards } from "lucide-react";
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
  setBillingCheckoutLinkAction,
  updateBillingDocumentAction,
  updateBillingLineItemAction,
  updateBillingDocumentStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; document?: string }>;
};

function statusClass(status: BillingDocumentStatus) {
  if (status === BillingDocumentStatus.PAID || status === BillingDocumentStatus.ACCEPTED) return "pill success";
  if (status === BillingDocumentStatus.VOID || status === BillingDocumentStatus.OVERDUE) return "pill danger";
  return "pill";
}

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function dateInputValue(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function currencyTotalsLabel(totals: { currency: string; _sum: { totalCents: number | null } }[]) {
  if (!totals.length) return formatMoney(0);
  return totals.map((row) => formatMoney(row._sum.totalCents || 0, row.currency)).join(" / ");
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
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);

  await prisma.billingDocument.updateMany({
    where: {
      status: { in: [BillingDocumentStatus.SENT, BillingDocumentStatus.ACCEPTED] },
      dueAt: { lt: new Date() }
    },
    data: { status: BillingDocumentStatus.OVERDUE }
  });

  const [documents, clients, documentCount, paidTotals, openTotals] = await Promise.all([
    prisma.billingDocument.findMany({
      include: {
        client: true,
        _count: { select: { lineItems: true, attachments: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.client.findMany({
      orderBy: { updatedAt: "desc" },
      take: 40
    }),
    prisma.billingDocument.count(),
    prisma.billingDocument.groupBy({
      by: ["currency"],
      where: { status: BillingDocumentStatus.PAID },
      _sum: { totalCents: true }
    }),
    prisma.billingDocument.groupBy({
      by: ["currency"],
      where: { status: { in: [BillingDocumentStatus.SENT, BillingDocumentStatus.ACCEPTED, BillingDocumentStatus.OVERDUE] } },
      _sum: { totalCents: true }
    })
  ]);

  const selectedDocumentId = params.document || documents[0]?.id;
  const selectedDocument = selectedDocumentId
    ? await prisma.billingDocument.findUnique({
        where: { id: selectedDocumentId },
        include: {
          client: true,
          lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          attachments: { orderBy: { createdAt: "desc" } }
        }
      })
    : null;
  const savedMessage = params.saved ? "Billing changes saved." : null;
  const errorMessage = params.error || null;
  const selectedDocumentIsDraft = selectedDocument?.status === BillingDocumentStatus.DRAFT;
  const selectedDocumentIsFinal =
    selectedDocument?.status === BillingDocumentStatus.PAID || selectedDocument?.status === BillingDocumentStatus.VOID;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h1 style={{ fontSize: "2.4rem" }}>Quotes, invoices, and documents</h1>
          <p>Create billing records, compute totals server-side, attach documents, and track status through paid or accepted.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <ReceiptText size={22} />
          <h3>{documentCount} documents</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Quotes, invoices, and contracts in the billing workspace.
          </p>
        </div>
        <div className="card">
          <WalletCards size={22} />
          <h3>{currencyTotalsLabel(paidTotals)}</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Total marked paid across all billing records.
          </p>
        </div>
        <div className="card">
          <FileText size={22} />
          <h3>{currencyTotalsLabel(openTotals)}</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Sent, accepted, and overdue documents still open.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createBillingDocumentAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create billing document</h2>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="billing-type">Type</label>
              <select id="billing-type" name="type" defaultValue={BillingDocumentType.INVOICE}>
                {Object.values(BillingDocumentType).map((type) => (
                  <option key={type} value={type}>
                    {enumLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="billing-status">Status</label>
              <select id="billing-status" name="status" defaultValue={BillingDocumentStatus.DRAFT}>
                {[BillingDocumentStatus.DRAFT, BillingDocumentStatus.SENT].map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="billing-currency">Currency</label>
              <input id="billing-currency" name="currency" defaultValue="USD" maxLength={3} required />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
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
            <div className="field">
              <label htmlFor="billing-due">Due date</label>
              <input id="billing-due" name="dueAt" type="date" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="billing-name">Customer name</label>
              <input id="billing-name" name="customerName" required />
            </div>
            <div className="field">
              <label htmlFor="billing-email">Customer email</label>
              <input id="billing-email" name="customerEmail" type="email" required />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="line-description">First line item</label>
              <input id="line-description" name="lineDescription" required />
            </div>
            <div className="field">
              <label htmlFor="line-quantity">Quantity</label>
              <input id="line-quantity" name="quantity" type="number" min="1" defaultValue="1" required />
            </div>
            <div className="field">
              <label htmlFor="line-price">Unit price</label>
              <input id="line-price" name="unitPrice" inputMode="decimal" placeholder="250.00" required />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="billing-discount">Discount</label>
              <input id="billing-discount" name="discount" inputMode="decimal" />
            </div>
            <div className="field">
              <label htmlFor="billing-tax">Tax</label>
              <input id="billing-tax" name="tax" inputMode="decimal" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="billing-memo">Customer memo</label>
            <textarea id="billing-memo" name="publicMemo" />
          </div>
          <div className="field">
            <label htmlFor="billing-notes">Internal notes</label>
            <textarea id="billing-notes" name="notes" />
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Create document
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Billing queue</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Customer</th>
                <th>Total</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <Link href={`/admin/modules/billing?document=${document.id}`}>{document.documentNumber}</Link>
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {enumLabel(document.type)} - {document._count.lineItems} lines - {document._count.attachments} files
                    </span>
                  </td>
                  <td>
                    <strong>{document.customerName}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{document.customerEmail}</span>
                  </td>
                  <td>{formatMoney(document.totalCents, document.currency)}</td>
                  <td>
                    <span className={statusClass(document.status)}>{enumLabel(document.status)}</span>
                  </td>
                </tr>
              ))}
              {!documents.length ? (
                <tr>
                  <td colSpan={4}>No billing documents yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedDocument ? (
        <section className="grid-2">
          <div className="card stack">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>{selectedDocument.documentNumber}</h2>
                <p>
                  {enumLabel(selectedDocument.type)} for {selectedDocument.customerName}
                </p>
              </div>
              <span className={statusClass(selectedDocument.status)}>{enumLabel(selectedDocument.status)}</span>
            </div>
            <table className="table">
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
                  <td>Due</td>
                  <td>{selectedDocument.dueAt ? formatDateTime(selectedDocument.dueAt, settings.timezone) : "No due date"}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {nextStatuses(selectedDocument.status).map((status) => (
                <form action={updateBillingDocumentStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedDocument.id} />
                  <input type="hidden" name="status" value={status} />
                  <button className="button secondary" type="submit">
                    Mark {enumLabel(status)}
                  </button>
                </form>
              ))}
              {!nextStatuses(selectedDocument.status).length ? (
                <span className="pill">Final state</span>
              ) : null}
            </div>
            <div className="subpanel form-grid">
              <h3 style={{ fontSize: "1.05rem" }}>Client link and payment handoff</h3>
              <div className="grid-2">
                <div>
                  <p style={{ color: "var(--muted)", marginBottom: 8 }}>Public document</p>
                  {selectedDocument.publicAccessToken && !selectedDocumentIsDraft ? (
                    <a className="button secondary" href={`/billing/${selectedDocument.publicAccessToken}`} target="_blank" rel="noreferrer">
                      Open client view
                    </a>
                  ) : (
                    <span className="pill">Available after send</span>
                  )}
                </div>
                <div>
                  <p style={{ color: "var(--muted)", marginBottom: 8 }}>Customer notice</p>
                  {!selectedDocumentIsDraft ? (
                    <form action={queueBillingDocumentEmailAction}>
                      <input type="hidden" name="id" value={selectedDocument.id} />
                      <button className="button secondary" type="submit">
                        Queue email
                      </button>
                    </form>
                  ) : (
                    <span className="pill">Send first</span>
                  )}
                </div>
              </div>
              <div className="subpanel form-grid">
                <div className="page-header" style={{ marginBottom: 0, minHeight: 0 }}>
                  <div>
                    <h3 style={{ fontSize: "1.05rem" }}>Stripe Checkout link</h3>
                    <p>
                      {selectedDocument.checkoutUrl
                        ? "Hosted payment link is attached."
                        : "No hosted payment link is attached."}
                    </p>
                  </div>
                  {selectedDocument.checkoutUrl ? (
                    <a className="button secondary" href={selectedDocument.checkoutUrl} target="_blank" rel="noreferrer">
                      Open link
                    </a>
                  ) : null}
                </div>
                {!selectedDocumentIsDraft && !selectedDocumentIsFinal ? (
                  <form action={setBillingCheckoutLinkAction} className="form-grid">
                    <input type="hidden" name="id" value={selectedDocument.id} />
                    <div className="grid-2">
                      <div className="field">
                        <label htmlFor={`billing-${selectedDocument.id}-checkout`}>Stripe Checkout URL</label>
                        <input
                          id={`billing-${selectedDocument.id}-checkout`}
                          name="checkoutUrl"
                          placeholder="https://checkout.stripe.com/..."
                          defaultValue={selectedDocument.checkoutUrl}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`billing-${selectedDocument.id}-payment-ref`}>Stripe reference</label>
                        <input
                          id={`billing-${selectedDocument.id}-payment-ref`}
                          name="paymentExternalReference"
                          placeholder="cs_test_..."
                          defaultValue={selectedDocument.paymentExternalReference}
                        />
                      </div>
                    </div>
                    <button className="button secondary" type="submit">
                      Save hosted payment link
                    </button>
                  </form>
                ) : null}
                {selectedDocument.checkoutUrl && !selectedDocumentIsFinal ? (
                  <form action={clearBillingCheckoutLinkAction} className="form-grid">
                    <input type="hidden" name="id" value={selectedDocument.id} />
                    <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                      <input name="confirmClear" type="checkbox" required />
                      Clear this hosted payment link.
                    </label>
                    <button className="button danger" type="submit">
                      Clear payment link
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            {selectedDocumentIsDraft ? (
              <form action={updateBillingDocumentAction} className="subpanel form-grid">
                <h3 style={{ fontSize: "1.05rem" }}>Edit draft details</h3>
                <input type="hidden" name="id" value={selectedDocument.id} />
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-client`}>Client</label>
                    <select id={`billing-${selectedDocument.id}-client`} name="clientId" defaultValue={selectedDocument.clientId || ""}>
                      <option value="">No linked client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-currency`}>Currency</label>
                    <input
                      id={`billing-${selectedDocument.id}-currency`}
                      name="currency"
                      defaultValue={selectedDocument.currency}
                      maxLength={3}
                      required
                    />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-name`}>Customer name</label>
                    <input id={`billing-${selectedDocument.id}-name`} name="customerName" defaultValue={selectedDocument.customerName} required />
                  </div>
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-email`}>Customer email</label>
                    <input
                      id={`billing-${selectedDocument.id}-email`}
                      name="customerEmail"
                      type="email"
                      defaultValue={selectedDocument.customerEmail}
                      required
                    />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-due`}>Due date</label>
                    <input id={`billing-${selectedDocument.id}-due`} name="dueAt" type="date" defaultValue={dateInputValue(selectedDocument.dueAt)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-discount`}>Discount</label>
                    <input id={`billing-${selectedDocument.id}-discount`} name="discount" inputMode="decimal" defaultValue={moneyInput(selectedDocument.discountCents)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`billing-${selectedDocument.id}-tax`}>Tax</label>
                    <input id={`billing-${selectedDocument.id}-tax`} name="tax" inputMode="decimal" defaultValue={moneyInput(selectedDocument.taxCents)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`billing-${selectedDocument.id}-memo`}>Customer memo</label>
                  <textarea id={`billing-${selectedDocument.id}-memo`} name="publicMemo" defaultValue={selectedDocument.publicMemo} />
                </div>
                <div className="field">
                  <label htmlFor={`billing-${selectedDocument.id}-notes`}>Internal notes</label>
                  <textarea id={`billing-${selectedDocument.id}-notes`} name="notes" defaultValue={selectedDocument.notes} />
                </div>
                <button className="button secondary" type="submit">
                  Save draft details
                </button>
              </form>
            ) : (
              <p style={{ color: "var(--muted)", margin: 0 }}>Finalized documents are locked. Create a replacement or void the document when a correction is needed.</p>
            )}
          </div>

          <div className="card stack">
            <h2 style={{ fontSize: "1.35rem" }}>Line items</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedDocument.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.lineTotalCents, selectedDocument.currency)}</td>
                    <td>
                      {selectedDocumentIsDraft ? (
                        <details>
                          <summary>Edit</summary>
                          <form action={updateBillingLineItemAction} className="form-grid" style={{ marginTop: 12, minWidth: 280 }}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                            <div className="field">
                              <label htmlFor={`line-${item.id}-description`}>Description</label>
                              <input id={`line-${item.id}-description`} name="description" defaultValue={item.description} required />
                            </div>
                            <div className="grid-3">
                              <div className="field">
                                <label htmlFor={`line-${item.id}-quantity`}>Qty</label>
                                <input id={`line-${item.id}-quantity`} name="quantity" type="number" min="1" defaultValue={item.quantity} required />
                              </div>
                              <div className="field">
                                <label htmlFor={`line-${item.id}-price`}>Unit price</label>
                                <input id={`line-${item.id}-price`} name="unitPrice" inputMode="decimal" defaultValue={moneyInput(item.unitPriceCents)} required />
                              </div>
                              <div className="field">
                                <label htmlFor={`line-${item.id}-sort`}>Sort</label>
                                <input id={`line-${item.id}-sort`} name="sortOrder" type="number" defaultValue={item.sortOrder} />
                              </div>
                            </div>
                            <button className="button secondary" type="submit">
                              Save line
                            </button>
                          </form>
                          <form action={deleteBillingLineItemAction} className="form-grid" style={{ marginTop: 12, minWidth: 280 }}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                              <input name="confirmDelete" type="checkbox" required />
                              Delete this line item.
                            </label>
                            <button className="button danger" type="submit">
                              Delete line
                            </button>
                          </form>
                        </details>
                      ) : (
                        <span className="pill">Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedDocumentIsDraft ? (
              <form action={addBillingLineItemAction} className="subpanel form-grid">
                <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
                <div className="grid-3">
                  <div className="field">
                    <label htmlFor="new-line-description">Description</label>
                    <input id="new-line-description" name="description" required />
                  </div>
                  <div className="field">
                    <label htmlFor="new-line-quantity">Quantity</label>
                    <input id="new-line-quantity" name="quantity" type="number" min="1" defaultValue="1" required />
                  </div>
                  <div className="field">
                    <label htmlFor="new-line-price">Unit price</label>
                    <input id="new-line-price" name="unitPrice" inputMode="decimal" required />
                  </div>
                </div>
                <button className="button secondary" type="submit">
                  Add line item
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {selectedDocument ? (
        <section className="grid-2">
          {selectedDocumentIsDraft ? (
            <form action={addBillingAttachmentAction} className="card form-grid">
              <input type="hidden" name="billingDocumentId" value={selectedDocument.id} />
              <h2 style={{ fontSize: "1.35rem" }}>Attach document</h2>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="attachment-title">Title</label>
                  <input id="attachment-title" name="title" required />
                </div>
                <div className="field">
                  <label htmlFor="attachment-url">URL</label>
                  <input id="attachment-url" name="url" placeholder="https://example.com/file.pdf" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="attachment-notes">Notes</label>
                <input id="attachment-notes" name="notes" />
              </div>
              <button className="button secondary" type="submit">
                Attach file
              </button>
            </form>
          ) : (
            <div className="card">
              <h2 style={{ fontSize: "1.35rem" }}>Attach document</h2>
              <p style={{ color: "var(--muted)", margin: 0 }}>Attachments are locked once the document leaves draft.</p>
            </div>
          )}

          <div className="card stack">
            <h2 style={{ fontSize: "1.35rem" }}>Attachments</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>URL</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {selectedDocument.attachments.map((attachment) => (
                  <tr key={attachment.id}>
                    <td>
                      <strong>{attachment.title}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{attachment.notes || "No notes"}</span>
                    </td>
                    <td>{attachment.url}</td>
                    <td>{formatDateTime(attachment.createdAt, settings.timezone)}</td>
                  </tr>
                ))}
                {!selectedDocument.attachments.length ? (
                  <tr>
                    <td colSpan={3}>No attachments yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
