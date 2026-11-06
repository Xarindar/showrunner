"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  noteForm,
  noteCount,
  notesPagination,
  notesTable
}: ClientNotesDocumentsCardProps) {
  const [activeForm, setActiveForm] = useState<ClientWorkspaceTab | null>(null);
  return <>
    <Card as="section" id="client-notes-documents" className="clients-detail-grid-card clients-notes-documents-card" minHeight="none" bodyClassName="clients-notes-documents-card-body">
      <h2 className="section-title">Notes &amp; documents</h2>
      <section className="clients-records-section" id="client-notes-panel" aria-labelledby="client-notes-title">
        <div className="clients-notes-documents-header"><h3 id="client-notes-title">Notes <span className="ui-badge">{noteCount}</span></h3><Button type="button" variant="secondary" size="sm" onClick={() => setActiveForm("notes")}><Plus size={16} />Add note</Button></div>
        {noteCount ? <>{notesTable}{notesPagination}</> : <p className="ui-muted-flush">No notes yet.</p>}
      </section>
      <section className="clients-records-section" id="client-documents-panel" aria-labelledby="client-documents-title">
        <div className="clients-notes-documents-header"><h3 id="client-documents-title">Documents <span className="ui-badge">{documentCount}</span></h3><Button type="button" variant="secondary" size="sm" onClick={() => setActiveForm("documents")}><Plus size={16} />Add document</Button></div>
        {documentCount ? <>{documentsTable}{documentsPagination}</> : <p className="ui-muted-flush">No documents yet.</p>}
      </section>
    </Card>
    <Modal open={activeForm !== null} title={activeForm === "notes" ? "Add note" : "Add document"} className="clients-add-record-modal" onClose={() => setActiveForm(null)}>
      {activeForm === "notes" ? noteForm : activeForm === "documents" ? documentForm : null}
    </Modal>
  </>;
}
