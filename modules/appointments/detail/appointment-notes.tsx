"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function AppointmentNotes({ children, noteForm }: { children: ReactNode; noteForm: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <section className="ui-data-table-shell" aria-labelledby="appointment-notes-title">
      <div className="ui-data-table-titlebar"><h2 id="appointment-notes-title">Internal notes</h2><Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus size={16} aria-hidden="true" />Add note</Button></div>
      {children}
    </section>
    <Modal open={open} title="Add note" onClose={() => setOpen(false)}>{noteForm}</Modal>
  </>;
}
