import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { Table } from "./table";

type Note = { id: string; content: string; createdAt: Date };

export function NotesTable({ notes, timezone, renderActions }: { notes: Note[]; timezone: string; renderActions: (note: Note) => ReactNode }) {
  return <Table mobileLayout="columns" tableClassName="ui-data-table" aria-label="Notes">
    <thead><tr><th data-mobile-column>Note</th><th>Created</th><th data-mobile-column>Actions</th></tr></thead>
    <tbody>
      {notes.map(note => <tr key={note.id}>
        <td data-mobile-column><details><summary>{note.content.length > 72 ? `${note.content.slice(0, 71)}...` : note.content}</summary><p className="ui-notes-content">{note.content}</p></details></td>
        <td>{formatDateTime(note.createdAt, timezone)}</td>
        <td data-mobile-column>{renderActions(note)}</td>
      </tr>)}
      {!notes.length ? <tr><td className="ui-data-table-empty" colSpan={3}>No notes yet.</td></tr> : null}
    </tbody>
  </Table>;
}
