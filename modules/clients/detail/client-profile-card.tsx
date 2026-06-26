"use client";

import { useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button, Card } from "@/components/ui";

type ClientProfileCardProps = {
  affiliation: string;
  details: ReactNode;
  editForm: ReactNode;
  email: string;
  name: string;
  phone: string;
  photoUrl: string;
  pipeline: string;
  status: string;
};

type ClientProfileSummaryItem = {
  href?: string;
  label: string;
  value: string;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
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
  affiliation,
  details,
  editForm,
  email,
  name,
  phone,
  photoUrl,
  pipeline,
  status
}: ClientProfileCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const initials = useMemo(() => initialsFor(name, email), [email, name]);
  const summaryItems: ClientProfileSummaryItem[] = [
    phone ? { href: phoneHref(phone), label: "Phone", value: phone } : { label: "Phone", value: "No phone" },
    { href: `mailto:${email}`, label: "Email", value: email },
    { label: "Pipeline", value: pipeline }
  ];

  function handleToggleDetails() {
    const nextExpanded = !expanded;
    const updateExpandedState = () => {
      setExpanded(nextExpanded);
      if (!nextExpanded) setEditing(false);
    };
    const transitionDocument =
      typeof document === "undefined" ? null : (document as ViewTransitionDocument);

    if (transitionDocument?.startViewTransition) {
      transitionDocument.startViewTransition(() => {
        flushSync(updateExpandedState);
      });
      return;
    }

    updateExpandedState();
  }

  return (
    <Card
      as="article"
      className={expanded ? "clients-profile-card is-expanded" : "clients-profile-card"}
      minHeight="none"
      bodyClassName="clients-profile-card-body">
      <div className="clients-profile-card-head">
        <div className="clients-profile-card-main">
          <div className="clients-profile-photo" aria-hidden="true">
            {photoUrl ? <img alt="" src={photoUrl} /> : <span>{initials}</span>}
          </div>
          <div className="clients-profile-card-copy">
            <h2>{name}</h2>
            <span>{affiliation}</span>
            <span className="ui-badge">{status}</span>
          </div>
        </div>
        <div className="clients-profile-card-actions">
          <Button
            aria-expanded={expanded}
            className="clients-profile-toggle"
            onClick={handleToggleDetails}
            size="sm"
            type="button"
            variant="secondary">
            {expanded ? "Hide details" : "Show details"}
          </Button>
          {expanded ? (
            <Button onClick={() => setEditing((current) => !current)} size="sm" type="button" variant="ghost">
              {editing ? "Close edit" : "Edit profile"}
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="clients-profile-quick-list" aria-label="Client highlights">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.href ? <a href={item.href}>{item.value}</a> : item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="clients-profile-expanded" aria-hidden={!expanded}>
        <div className="clients-profile-expanded-inner">
          <div className="clients-profile-expanded-header">
            <span>Profile details</span>
          </div>
          {details}
          {editing ? <div className="clients-profile-details-body">{editForm}</div> : null}
        </div>
      </div>
    </Card>
  );
}
