"use client";

import { FileText, Plus, StickyNote } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Card, Modal, Tab, Tabs } from "@/components/ui";

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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeRecordsTab, setActiveRecordsTab] = useState<ClientWorkspaceTab>(initialActiveTab);
  const [activeForm, setActiveForm] = useState<ClientWorkspaceTab>(initialActiveTab);

  function openAddModal() {
    setActiveForm(activeRecordsTab);
    setAddModalOpen(true);
  }

  return (
    <>
      <Card
        as="section"
        id="client-notes-documents"
        className="clients-detail-grid-card clients-notes-documents-card"
        minHeight="none"
        bodyClassName="clients-notes-documents-card-body">
        <div className="clients-notes-documents-header">
          <div>
            <h2 className="section-title">Notes &amp; documents</h2>
            <p className="ui-zero muted-text">Client notes and linked documents.</p>
          </div>
          <Button
            aria-label={activeRecordsTab === "notes" ? "Add note" : "Add document"}
            onClick={openAddModal}
            size="sm"
            type="button"
            variant="secondary">
            <Plus aria-hidden="true" size={16} />
            Add
          </Button>
        </div>

        <div className="clients-records-toolbar">
          <Tabs aria-label="Client records" className="clients-record-tabs">
            <Tab
              aria-controls="client-notes-panel"
              aria-selected={activeRecordsTab === "notes"}
              id="client-notes-tab"
              onClick={() => setActiveRecordsTab("notes")}>
              <StickyNote aria-hidden="true" size={16} />
              Notes
              <span className="ui-tab-count">{noteCount}</span>
            </Tab>
            <Tab
              aria-controls="client-documents-panel"
              aria-selected={activeRecordsTab === "documents"}
              id="client-documents-tab"
              onClick={() => setActiveRecordsTab("documents")}>
              <FileText aria-hidden="true" size={16} />
              Documents
              <span className="ui-tab-count">{documentCount}</span>
            </Tab>
          </Tabs>
        </div>

        <div className="ui-tab-panels clients-records-panels">
          <section
            aria-labelledby="client-notes-tab"
            className="ui-tab-panel clients-records-section"
            hidden={activeRecordsTab !== "notes"}
            id="client-notes-panel"
            role="tabpanel">
            {notesTable}
            {notesPagination}
          </section>

          <section
            aria-labelledby="client-documents-tab"
            className="ui-tab-panel clients-records-section"
            hidden={activeRecordsTab !== "documents"}
            id="client-documents-panel"
            role="tabpanel">
            {documentsTable}
            {documentsPagination}
          </section>
        </div>
      </Card>

      <Modal
        bodyClassName="clients-add-record-modal-body"
        className="clients-add-record-modal"
        onClose={() => setAddModalOpen(false)}
        open={addModalOpen}
        title="Add note or document">
        <Tabs aria-label="Choose record type" className="clients-add-record-tabs">
          <Tab aria-selected={activeForm === "notes"} onClick={() => setActiveForm("notes")}>
            <StickyNote aria-hidden="true" size={16} />
            Note
          </Tab>
          <Tab aria-selected={activeForm === "documents"} onClick={() => setActiveForm("documents")}>
            <FileText aria-hidden="true" size={16} />
            Document
          </Tab>
        </Tabs>
        <div className="ui-tab-panels">
          <div className="ui-tab-panel" hidden={activeForm !== "notes"}>
            {noteForm}
          </div>
          <div className="ui-tab-panel" hidden={activeForm !== "documents"}>
            {documentForm}
          </div>
        </div>
      </Modal>
    </>
  );
}
