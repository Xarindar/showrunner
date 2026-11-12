"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Upload } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { getClientGalleryWorkspace } from "@/modules/portfolio/client-actions";
import { clientSessionPath, clientSessionRows, type ClientGalleryWorkspace } from "@/modules/portfolio/client-gallery-validation";

export function ClientSessionsTable({ clientId, initialWorkspace }: { clientId: string; initialWorkspace: ClientGalleryWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const processing = workspace.galleries.some(gallery => gallery.imageStatus === "Images processing");
  useEffect(() => {
    if (!processing) return;
    let current = true;
    const timer = setInterval(() => { void getClientGalleryWorkspace(clientId).then(next => { if (current) setWorkspace(next); }).catch(() => {}); }, 3000);
    return () => { current = false; clearInterval(timer); };
  }, [clientId, processing]);
  const rows = clientSessionRows(workspace);
  return <section className="ui-data-table-shell clients-detail-sessions clients-session-index" aria-labelledby="client-sessions-title">
    <header className="ui-data-table-titlebar"><h2 id="client-sessions-title">Sessions</h2></header>
    <Table mobileLayout="columns" aria-label="Client sessions" tableClassName="ui-data-table">
      <thead><tr><th data-mobile-column>Session</th><th>Date</th><th data-mobile-column>Status</th><th>Photos</th><th data-mobile-column>Actions</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td data-mobile-column><Link className="clients-detail-cell-text" href={clientSessionPath(clientId, row.id)}>{row.title}</Link></td>
        <td>{row.date || "—"}</td><td data-mobile-column><span className="ui-badge" role="status">{row.imageStatus}</span></td><td>{row.photoCount}</td>
        <td data-mobile-column><div className="clients-row-actions">
          <ButtonLink className="clients-action-icon" aria-label={`Open ${row.title}`} title="Open session" href={clientSessionPath(clientId, row.id)} size="sm" variant="secondary"><Eye aria-hidden="true" size={15} /></ButtonLink>
          {workspace.canUpload ? <ButtonLink className="clients-action-icon" aria-label={`Upload photos to ${row.title}`} title="Upload photos" href={`${clientSessionPath(clientId, row.id)}?upload=1`} size="sm" variant="secondary"><Upload aria-hidden="true" size={15} /></ButtonLink> : null}
        </div></td>
      </tr>)}{!rows.length ? <tr><td colSpan={5}>No sessions yet.</td></tr> : null}</tbody>
    </Table>
  </section>;
}
