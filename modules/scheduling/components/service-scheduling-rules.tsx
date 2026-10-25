"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import styles from "./service-scheduling-rules.module.css";

export function ServiceSchedulingRules({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="secondary" onClick={event => {
      setContainer(event.currentTarget.closest(".admin-main") || document.body);
      setOpen(true);
    }}>
      <Clock3 size={16} />Business hours
    </Button>
    {container && createPortal(
      // Keep scheduling forms outside the service form, including React's event bubbling.
      <div onSubmit={event => event.stopPropagation()} onReset={event => event.stopPropagation()}>
        <Modal open={open} title="Scheduling rules" onClose={() => setOpen(false)} className={styles.dialog} bodyClassName={styles.body}>
          {children}
        </Modal>
      </div>, container)}
  </>;
}
