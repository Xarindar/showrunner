"use client";

import { useState, type ReactNode } from "react";
import { Filter, Plus, Upload } from "lucide-react";
import { Button, Modal } from "@/components/ui";

type ActiveModal = "add" | "filters" | "data" | null;

type ClientsActionModalsProps = {
  addClient: ReactNode;
  dataTools: ReactNode;
  filters: ReactNode;
};

const modalTitles: Record<Exclude<ActiveModal, null>, string> = {
  add: "Add client",
  data: "Import and export",
  filters: "Client filters"
};

export function ClientsActionModals({ addClient, dataTools, filters }: ClientsActionModalsProps) {
  const [active, setActive] = useState<ActiveModal>(null);
  const close = () => setActive(null);

  return (
    <>
      <div className="clients-card-actions" aria-label="Client tools">
        <Button aria-haspopup="dialog" onClick={() => setActive("add")} size="sm" type="button">
          <Plus size={15} />
          Add
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setActive("filters")} size="sm" type="button" variant="secondary">
          <Filter size={15} />
          Filters
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setActive("data")} size="sm" type="button" variant="secondary">
          <Upload size={15} />
          CSV
        </Button>
      </div>

      <Modal
        bodyClassName="clients-modal-body"
        className="clients-modal"
        onClose={close}
        open={active !== null}
        title={active ? modalTitles[active] : ""}>
        {active === "add" ? addClient : null}
        {active === "filters" ? filters : null}
        {active === "data" ? dataTools : null}
      </Modal>
    </>
  );
}
