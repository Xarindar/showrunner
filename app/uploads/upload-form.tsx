"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { maxFileBytes } from "@/lib/uploads/validation";
import styles from "./uploads.module.css";

type Entry = { file: File; progress: number; status: string; done: boolean; id?: string; url?: string; uploaded?: boolean };

function uploadBytes(url: string, file: File, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("If-None-Match", "*");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload interrupted. Please retry."));
    xhr.onerror = () => reject(new Error("Connection lost. Please retry."));
    xhr.timeout = 30 * 60 * 1000;
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry."));
    xhr.send(file);
  });
}

export function UploadForm({ token }: { token: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = (entry: Entry, changes: Partial<Entry>) => {
    Object.assign(entry, changes);
    setEntries((current) => [...current]);
  };
  function choose(files: File[]) {
    setMessage("");
    if (files.length > 200 || files.some((file) => file.size === 0 || file.size > maxFileBytes)) {
      setMessage("Choose up to 200 files, each between 1 byte and 250 MB."); return;
    }
    setEntries(files.map((file) => ({ file, progress: 0, status: "Ready", done: false })));
  }
  async function api(body: object) {
    const response = await fetch(`/api/uploads/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please retry.");
    return result;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !entries.length) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("Keep this page open until every file says Received.");
    for (const entry of entries.filter((item) => !item.done)) {
      try {
        update(entry, { status: "Preparing…" });
        if (!entry.id) {
          const ticket = await api({ filename: entry.file.name, sizeBytes: entry.file.size,
            senderName: form.get("name"), senderEmail: form.get("email") });
          update(entry, { id: ticket.id });
        }
        // A successful PUT with a lost response is still received; confirm before attempting a retry.
        if (!entry.uploaded) {
          try {
            await api({ action: "complete", id: entry.id });
            update(entry, { uploaded: true });
          } catch {
            const ticket = await api({ action: "retry", id: entry.id });
            update(entry, { url: ticket.url });
            update(entry, { status: "Uploading…" });
            await uploadBytes(entry.url!, entry.file, (progress) => update(entry, { progress }));
            update(entry, { uploaded: true });
          }
        }
        update(entry, { status: "Confirming receipt…" });
        await api({ action: "complete", id: entry.id });
        update(entry, { done: true, progress: 100, status: "Received — original file" });
      } catch (error) {
        update(entry, { status: error instanceof Error ? error.message : "Please retry." });
      }
    }
    setBusy(false);
    setMessage(entries.every((item) => item.done) ? "All files received. Thank you!" : "Some files were not received. Select Retry remaining files to try again.");
  }
  const complete = entries.length > 0 && entries.every((entry) => entry.done);
  return <form onSubmit={submit} className={styles.form}>
    <label className={styles.field}>Your name<Input name="name" autoComplete="name" required maxLength={120} disabled={busy} /></label>
    <label className={styles.field}>Email<Input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></label>
    <div className={styles.drop} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); if (!busy) choose(Array.from(event.dataTransfer.files));
    }}>
      <label htmlFor="original-files"><strong>Choose files or drop them here</strong></label>
      <input id="original-files" type="file" multiple disabled={busy} onChange={(event) => choose(Array.from(event.target.files || []))} aria-describedby="file-limits" />
      <p id="file-limits">Photos, videos, logos, documents, or ZIP folders. Up to 250 MB per file and 10 GB per project link.</p>
    </div>
    <ul className={styles.files}>{entries.map((entry, index) => <li key={index}>
      <strong>{entry.file.name}</strong><span>{(entry.file.size / 1024 / 1024).toFixed(1)} MB · {entry.status}</span>
      <progress value={entry.progress} max={100} aria-label={`Upload progress for ${entry.file.name}`} />
    </li>)}</ul>
    <Button type="submit" disabled={busy || !entries.length || complete}>{busy ? "Sending originals…" : complete ? "Files received" : entries.some((entry) => entry.id) ? "Retry remaining files" : "Send original files"}</Button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
