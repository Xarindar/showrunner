"use client";

import { useMemo, useState } from "react";
import { Eye, Mail, Phone } from "lucide-react";
import { Button, ButtonLink, Modal } from "@/components/ui";

type ClientRowActionsProps = {
  alternateEmails: string[];
  alternatePhones: string[];
  detailHref: string;
  email: string;
  name: string;
  phone: string;
};

function uniqueContactValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function phoneHref(value: string) {
  const dialable = value.replace(/[^\d+]/g, "");
  return `tel:${dialable || value}`;
}

export function ClientRowActions({ alternateEmails, alternatePhones, detailHref, email, name, phone }: ClientRowActionsProps) {
  const [open, setOpen] = useState(false);
  const emails = useMemo(() => uniqueContactValues([email, ...alternateEmails]), [alternateEmails, email]);
  const phones = useMemo(() => uniqueContactValues([phone, ...alternatePhones]), [alternatePhones, phone]);

  return (
    <>
      <div className="clients-row-actions">
        <Button
          aria-haspopup="dialog"
          aria-label={`Contact ${name}`}
          className="clients-action-icon"
          onClick={() => setOpen(true)}
          size="sm"
          title="Contact client"
          type="button"
          variant="secondary"
        >
          <Mail size={15} />
        </Button>
        <ButtonLink aria-label={`Open ${name}`} className="clients-action-icon" href={detailHref} size="sm" title="Open client" variant="secondary">
          <Eye size={15} />
        </ButtonLink>
      </div>

      <Modal bodyClassName="clients-contact-modal-body" className="clients-contact-modal" onClose={() => setOpen(false)} open={open} title={name}>
        <section className="clients-contact-section">
          <h3>Email</h3>
          <div className="clients-contact-list">
            {emails.map((item, index) => (
              <a className="clients-contact-link" href={`mailto:${item}`} key={item}>
                <Mail size={15} />
                <span>{item}</span>
                <small>{index === 0 ? "Primary" : "Alternate"}</small>
              </a>
            ))}
          </div>
        </section>

        <section className="clients-contact-section">
          <h3>Phone</h3>
          {phones.length ? (
            <div className="clients-contact-list">
              {phones.map((item, index) => (
                <a className="clients-contact-link" href={phoneHref(item)} key={item}>
                  <Phone size={15} />
                  <span>{item}</span>
                  <small>{index === 0 ? "Primary" : "Alternate"}</small>
                </a>
              ))}
            </div>
          ) : (
            <p className="ui-muted-flush">No phone numbers on file.</p>
          )}
        </section>
      </Modal>
    </>
  );
}
