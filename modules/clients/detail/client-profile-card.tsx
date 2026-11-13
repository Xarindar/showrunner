"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";

type ClientProfileCardProps = {
  actions: ReactNode;
  initialActionsOpen?: boolean;
  address: string;
  company: string;
  editForm: ReactNode;
  email: string;
  name: string;
  phone: string;
  photoUrl: string;
  permissions: ReactNode;
};

type ClientProfileSummaryItem = {
  href?: string;
  label: string;
  value: string;
};

function initialsFor(name: string, email: string) {
  const source = name || email;
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "C";
}

function phoneHref(value: string) {
  const dialable = value.replace(/[^\d+]/g, "");
  return `tel:${dialable || value}`;
}

export function ClientProfileCard({
  actions,
  initialActionsOpen = false,
  address,
  company,
  editForm,
  email,
  name,
  phone,
  photoUrl,
  permissions
}: ClientProfileCardProps) {
  const [actionsOpen, setActionsOpen] = useState(initialActionsOpen);
  const [editing, setEditing] = useState(false);
  const initials = useMemo(() => initialsFor(name, email), [email, name]);
  const summaryItems: ClientProfileSummaryItem[] = [
    phone ? { href: phoneHref(phone), label: "Phone", value: phone } : { label: "Phone", value: "No phone" },
    { href: `mailto:${email}`, label: "Email", value: email },
    { label: "Address", value: address || "No address" }
  ];

  return (
    <>
    <section className="studio-panel ui-section-card clients-profile-card" aria-labelledby="client-profile-title">
      <div className="ui-section-header"><h2 id="client-profile-title">Client details</h2></div>
      <div className="ui-section-body clients-profile-card-body">
      <div className="clients-profile-card-head">
        <div className="clients-profile-card-main">
          <div className="clients-profile-photo" aria-hidden="true">
            {photoUrl ? <Image alt="" src={photoUrl} width={64} height={64} unoptimized /> : <span>{initials}</span>}
          </div>
          <div className="clients-profile-card-copy">
            <h2>{name}</h2>
            {company ? <span>{company}</span> : null}
          </div>
        </div>
      </div>
      <dl className="clients-profile-quick-list" aria-label="Client highlights">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.href ? <a href={item.href}>{item.value}</a> : item.value}</dd>
          </div>
        ))}
        <div><dt>Permissions</dt><dd className="clients-profile-badge-list">{permissions}</dd></div>
      </dl>
      <div className="clients-profile-footer"><Button aria-haspopup="dialog" onClick={() => setActionsOpen(true)} size="sm" type="button" variant="secondary"><MoreHorizontal aria-hidden="true" size={15} />More</Button></div>
      </div>
    </section>
    <Modal open={actionsOpen} title={editing ? `Edit ${name}` : "Client actions"} className="clients-modal" onClose={() => { setActionsOpen(false); setEditing(false); }}>
      <div className="ui-stack">
        {editing ? editForm : actions}
        <div className="module-modal-actions"><Button onClick={() => setEditing(current => !current)} size="sm" type="button" variant="secondary">{editing ? "Back" : "Edit profile"}</Button></div>
      </div>
    </Modal>
    </>
  );
}
