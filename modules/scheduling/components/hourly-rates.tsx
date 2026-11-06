"use client";

import { useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { HourlyRate } from "@/lib/scheduling/pricing";
import { saveHourlyRateAction } from "../rate-actions";
import { useNotify } from "@/components/ui/notifications";
import { Pagination } from "@/components/ui/pagination";
import { Tooltip } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import { useCatalogTablePagination } from "./use-catalog-table-pagination";

export function HourlyRateEditor({ rate, onSave, onClose }: { rate?: HourlyRate; onSave: (rate: HourlyRate) => void; onClose: () => void }) {
  const [name, setName] = useState(rate?.name ?? "");
  const [amount, setAmount] = useState(rate ? (rate.amountCents / 100).toFixed(2) : "");
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const fields = useRef<HTMLDivElement>(null);
  async function save() {
    if (pending || [...(fields.current?.querySelectorAll("input") ?? [])].some(input => !input.reportValidity())) return;
    setPending(true);
    try {
      const result = await saveHourlyRateAction({ id: rate?.id, name, amount });
      if (result.error) notify(result.error, "danger");
      else if (result.rate) { notify("Hourly rate saved."); onSave(result.rate); }
    } catch { notify("The rate could not be saved. Please try again.", "danger"); }
    finally { setPending(false); }
  }
  return <Modal open title={rate ? "Edit hourly rate" : "New hourly rate"} onClose={() => { if (!pending) onClose(); }}>
    <div ref={fields} className="stack" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); void save(); } }}>
      <Field label="Rate name"><Input autoFocus required maxLength={120} value={name} disabled={pending} placeholder="Standard photography" onChange={event => setName(event.target.value)} /></Field>
      <Field label="Rate per hour (USD)"><Input required type="number" min="0" max="9999999.99" step="0.01" inputMode="decimal" value={amount} disabled={pending} onChange={event => setAmount(event.target.value)} /></Field>
      {rate && <p className="ui-field-hint">Changes apply to new bookings for services using this rate. Existing bookings keep their saved prices.</p>}
      <div className="module-modal-actions"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save rate"}</Button></div>
    </div>
  </Modal>;
}

export function HourlyRates({ initialRates }: { initialRates: HourlyRate[] }) {
  const [rates, setRates] = useState(initialRates);
  const [editing, setEditing] = useState<HourlyRate | "new" | null>(null);
  const pagination = useCatalogTablePagination(rates.length);

  return <div className="stack products-workspace service-workspace">
    <header className="page-header"><h1>Hourly rates</h1></header>
    <section className="admin-index-panel">
      <div data-viewport-table className="service-catalog-folder-panel" aria-labelledby="hourly-rates-title">
        <div className="catalog-board-header">
          <div>
            <h2 id="hourly-rates-title">Rates</h2>
            <p>Define named rates, then choose them on sessions and included services.</p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" size={15} />Add rate</Button>
        </div>
        <div aria-label="Hourly rates table" className="catalog-table-scroll catalog-viewport-table hourly-rates-table" role="region" tabIndex={0}>
          <table className="catalog-product-table">
            <thead><tr><th>Rate name</th><th>Price per hour</th><th>Actions</th></tr></thead>
            <tbody>
              {rates.slice(pagination.startIndex, pagination.endIndex).map(rate => (
                <tr key={rate.id}>
                  <td><span className="catalog-cell-text" title={rate.name}>{rate.name}</span></td>
                  <td>{formatMoney(rate.amountCents)}</td>
                  <td><div className="catalog-row-actions">
                    <Tooltip content="Edit rate" focusable={false}>
                      <Button className="catalog-icon-button" size="sm" variant="secondary" aria-label={`Edit ${rate.name}`} onClick={() => setEditing(rate)}>
                        <Pencil aria-hidden="true" size={15} />
                      </Button>
                    </Tooltip>
                  </div></td>
                </tr>
              ))}
              {!rates.length && <tr className="catalog-table-empty-state-row"><td colSpan={3}>
                <div className="catalog-empty-state"><h3>No hourly rates yet</h3><p>Add a rate to start offering hourly sessions.</p></div>
              </td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination label="Hourly rate pages" page={pagination.currentPage} pageCount={pagination.pageCount}
          onPageSizeChange={pagination.resizePage} onNext={pagination.nextPage} onPrevious={pagination.previousPage} />
      </div>
    </section>
    {editing && <HourlyRateEditor rate={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={rate => { setRates(current => [...current.filter(item => item.id !== rate.id), rate].sort((a, b) => a.name.localeCompare(b.name))); setEditing(null); }} />}
  </div>;
}
