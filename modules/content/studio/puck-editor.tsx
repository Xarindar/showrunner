"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Puck, usePuck, type Config, type Data } from "@puckeditor/core";
import { Monitor, Smartphone, Undo2, Redo2, X, ExternalLink } from "lucide-react";
import { Fields, type Choice } from "./editor";
import { blockRegistry } from "./registry";
import { saveStudioBlock } from "./actions";
import type { ContentBlockConfig, ContentManifest } from "./manifest";
import "@puckeditor/core/puck.css";
import styles from "./puck-editor.module.css";
import fieldStyles from "./studio.module.css";

type Entry = { block: ContentBlockConfig; payload: Record<string, unknown>; revision: number; pageIds: string[]; choices: Choice[] };
type Props = { manifest: ContentManifest; entries: Entry[]; canUpload: boolean };
export function PuckContentEditor(props: Props) {
  const config = useMemo<Config>(() => ({ components: Object.fromEntries(props.entries.map(entry => [entry.block.id, {
    label: entry.block.label,
    fields: { payload: { type: "custom", render: ({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) => <div className={fieldStyles.fields}><Fields
      canUpload={props.canUpload} fixedRows={entry.block.fixedRows} assetBaseUrl={entry.block.presentation?.assetBaseUrl || props.manifest.previewUrl} prefix={entry.block.id} value={value} onChange={onChange} choices={entry.choices}
      limits={entry.block.limits} minimums={entry.block.minimums}
      fields={Object.fromEntries(Object.entries(blockRegistry[entry.block.type].fields).filter(([key]) => entry.block.editableFields.includes(key)))}
    /></div> } },
    render: () => <></>
  }])) }), [props.entries, props.canUpload, props.manifest.previewUrl]);
  const data = useMemo<Data>(() => ({ root: { props: {} }, content: props.entries.map(entry => ({ type: entry.block.id, props: { id: entry.block.id, payload: entry.payload } })) }), [props.entries]);
  return <Puck config={config} data={data} permissions={{ insert: false, delete: false, duplicate: false, drag: false, edit: true }}><Workspace {...props} /></Puck>;
}

function Workspace({ manifest, entries }: Props) {
  const { appState, dispatch, selectedItem, history } = usePuck();
  const [pageId, setPageId] = useState(manifest.pages[0].id);
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(Object.fromEntries(entries.map(entry => [entry.block.id, { payload: entry.payload, revision: entry.revision }])));
  const frame = useRef<HTMLIFrameElement>(null);
  const page = manifest.pages.find(item => item.id === pageId)!;
  const pageEntries = useMemo(() => entries.filter(entry => entry.pageIds.includes(pageId) || entry.block.type === "business"), [entries, pageId]);
  const content = appState.data.content;
  const changed = content.filter(item => JSON.stringify(item.props.payload) !== JSON.stringify(saved[item.props.id]?.payload));
  const dirty = changed.length > 0;
  const selected = entries.find(entry => entry.block.id === selectedItem?.props.id);
  const siteUrl = manifest.previewUrl ? new URL(page.path, manifest.previewUrl).toString() : "";
  const previewUrl = siteUrl ? `${siteUrl}?showrunner-editor=1` : "";
  const previewOrigin = siteUrl ? new URL(siteUrl).origin : "";

  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    if (ready) return;
    // The iframe can finish loading before React hydrates and attaches onLoad.
    const connect = () => frame.current?.contentWindow?.postMessage({ channel: "showrunner-editor-v1", type: "connect" }, previewOrigin);
    const retry = window.setInterval(connect, 1000);
    const timer = window.setTimeout(() => { window.clearInterval(retry); setFrameError(true); }, 20000);
    return () => { window.clearInterval(retry); window.clearTimeout(timer); };
  }, [pageId, ready, previewOrigin]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== previewOrigin || event.data?.channel !== "showrunner-editor-v1") return;
      if (event.data.type === "ready") { setReady(true); setFrameError(false); }
      if (event.data.type === "select") {
        const index = content.findIndex(item => item.props.id === event.data.id);
        if (index >= 0 && pageEntries.some(entry => entry.block.id === event.data.id)) dispatch({ type: "setUi", ui: { itemSelector: { index } } });
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [content, dispatch, pageEntries, previewOrigin]);
  useEffect(() => {
    if (!ready || !frame.current?.contentWindow) return;
    const mediaUrl = (value: string) => value?.startsWith("/") ? new URL(value, window.location.origin).toString() : value;
    const blocks = pageEntries.map(entry => {
      let payload = content.find(item => item.props.id === entry.block.id)?.props.payload || entry.payload;
      payload = { ...payload, ...(payload.imageUrl ? { imageUrl: mediaUrl(payload.imageUrl) } : {}), ...(Array.isArray(payload.images) ? { images: payload.images.map((image: Record<string, string>) => ({ ...image, url: mediaUrl(image.url) })) } : {}) };
      if (entry.block.source === "services") payload = { ...payload, items: (payload.items as Record<string, string>[]).map(row => {
        const choice = entry.choices.find(item => item.id === row.referenceId);
        return { id: choice?.id, name: row.title || choice?.label || "", description: row.description || choice?.description || "", imageUrl: mediaUrl(choice?.imageUrl || "") };
      }) };
      return { id: entry.block.id, type: entry.block.type, payload, presentation: entry.block.presentation || {} };
    });
    frame.current.contentWindow.postMessage({ channel: "showrunner-editor-v1", type: "update", blocks, selectedId: selected?.block.id, assetOrigin: window.location.origin }, previewOrigin);
  }, [content, ready, pageEntries, previewOrigin, selected?.block.id]);

  async function publish() {
    setPending(true); setMessage(""); setError(false);
    try {
      for (const item of changed) {
        const entry = entries.find(entry => entry.block.id === item.props.id)!;
        const result = await saveStudioBlock({ id: item.props.id, revision: saved[item.props.id].revision, pageIds: entry.pageIds, payload: Object.fromEntries(entry.block.editableFields.map(key => [key, item.props.payload[key]])) });
        if (result.error || result.revision === undefined) throw new Error(result.error || "Save failed. Your edits are still here.");
        setSaved(current => ({ ...current, [item.props.id]: { payload: item.props.payload, revision: result.revision! } }));
      }
      setMessage("Changes published.");
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Unable to publish. Your edits are still here."); }
    finally { setPending(false); }
  }
  return <div className={`${styles.workspace} showrunner-content-workspace`}>
    <header className={styles.toolbar}>
      <h1>Content</h1>
      <label className={styles.pageLabel}>Page<select aria-label="Page" value={pageId} disabled={pending} onChange={event => { setPageId(event.target.value); setReady(false); setFrameError(false); dispatch({ type: "setUi", ui: { itemSelector: null } }); }}>{manifest.pages.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <div className={styles.devices} role="group" aria-label="Preview size"><button aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={18} /></button><button aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={18} /></button></div>
      <div className={styles.history}><button aria-label="Undo" disabled={!history.hasPast || pending} onClick={history.back}><Undo2 size={17} /></button><button aria-label="Redo" disabled={!history.hasFuture || pending} onClick={history.forward}><Redo2 size={17} /></button></div>
      <span className={styles.saveState}>{dirty ? "Unpublished changes" : "Up to date"}</span>
      {siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer" aria-label="Open website"><ExternalLink size={17} /></a>}
      <button className={styles.publish} disabled={!dirty || pending} onClick={publish}>{pending ? "Publishing…" : "Publish"}</button>
    </header>
    {message && <div className={styles.notice} role={error ? "alert" : "status"}>{message}</div>}
    <div className={styles.body}>
      <div className={styles.canvas}>
        {previewUrl ? <>
          {!ready && <div className={styles.loading} role="status">{frameError ? "The website editor connection is unavailable. Check that the site integration is deployed, then reload." : "Loading your website…"}</div>}
          <iframe ref={frame} key={pageId} src={previewUrl} title={`${page.label} website preview`} className={mobile ? styles.mobileFrame : styles.frame} onLoad={() => frame.current?.contentWindow?.postMessage({ channel: "showrunner-editor-v1", type: "connect" }, previewOrigin)} />
        </> : <div className={styles.loading}>Your website preview has not been connected. Your site administrator can connect it in the content manifest.</div>}
      </div>
      {selected ? <aside className={styles.inspector} aria-label="Section settings"><div className={styles.inspectorHeader}><h2>{selected.block.label}</h2><button aria-label="Close section settings" onClick={() => dispatch({ type: "setUi", ui: { itemSelector: null } })}><X size={18} /></button></div><fieldset disabled={pending}><Puck.Fields /></fieldset></aside> : null}
    </div>
    <footer className={styles.statusbar}><span>Click a section to edit its content</span><label>Section<select aria-label="Select section" value={selected?.block.id || ""} onChange={event => { const index = content.findIndex(item => item.props.id === event.target.value); dispatch({ type: "setUi", ui: { itemSelector: index < 0 ? null : { index } } }); }}><option value="">Choose a section</option>{pageEntries.map(entry => <option key={entry.block.id} value={entry.block.id}>{entry.block.label}</option>)}</select></label></footer>
  </div>;
}
