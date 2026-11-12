"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type ClientWorkspaceTab = "notes" | "documents";

type ClientNotesDocumentsCardProps = {
  documentCount: number;
  documentsTable: ReactNode;
  documentForm: ReactNode;
  documentsPagination: ReactNode;
  initialActiveTab?: ClientWorkspaceTab;
  noteForm: ReactNode;
  noteCount: number;
  notesPagination: ReactNode;
  notesTable: ReactNode;
};

export function ClientNotesDocumentsCard({
  documentCount,
  documentsTable,
  documentForm,
  documentsPagination,
  initialActiveTab = "notes",
  noteForm,
  noteCount,
  notesPagination,
  notesTable
}: ClientNotesDocumentsCardProps) {
  const [activeTab, setActiveTab] = useState<ClientWorkspaceTab>(initialActiveTab);
  const [activeForm, setActiveForm] = useState<ClientWorkspaceTab | null>(null);
  return <>
    <section className="ui-data-table-shell" id="client-notes-documents" aria-labelledby="client-records-title">
      <div className="ui-data-table-titlebar"><h2 id="client-records-title">Documents &amp; notes</h2><div className="ui-inline-actions">
        <Button type="button" variant="secondary" size="sm" onClick={() => setActiveForm("notes")}><Plus aria-hidden="true" size={16} />Add note</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setActiveForm("documents")}><Plus aria-hidden="true" size={16} />Add document</Button>
      </div></div>
      <div className="ui-table-filter-bar" role="group" aria-label="Show client records">
        <Button aria-pressed={activeTab === "notes"} type="button" variant="ghost" size="sm" onClick={() => setActiveTab("notes")}>Notes ({noteCount})</Button>
        <Button aria-pressed={activeTab === "documents"} type="button" variant="ghost" size="sm" onClick={() => setActiveTab("documents")}>Documents ({documentCount})</Button>
      </div>
      {activeTab === "notes" ? notesTable : documentsTable}
      {(activeTab === "notes" ? noteCount : documentCount) ? <div className="ui-data-table-footer">{activeTab === "notes" ? notesPagination : documentsPagination}</div> : null}
    </section>
    <Modal open={activeForm !== null} title={activeForm === "notes" ? "Add note" : "Add document"} className="clients-add-record-modal" onClose={() => setActiveForm(null)}>
      {activeForm === "notes" ? noteForm : activeForm === "documents" ? documentForm : null}
    </Modal>
  </>;
}
