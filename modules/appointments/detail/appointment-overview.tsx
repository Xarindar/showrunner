"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import styles from "./detail.module.css";

export function AppointmentContact({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" variant="ghost" className={styles.contactTrigger} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{name}</Button>
    <Modal open={open} title="Client contact" onClose={() => setOpen(false)}>{children}</Modal>
  </>;
}

export function AppointmentEdit({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="ui-data-table-titlebar">
      <h2 id="appointment-details-title">Appointment details</h2>
      <Button size="sm" variant="secondary" type="button" onClick={() => setOpen(true)}><Pencil size={15} aria-hidden="true" />Edit</Button>
    </div>
    <Modal open={open} title="Edit appointment details" onClose={() => setOpen(false)}>{children}</Modal>
  </>;
}
