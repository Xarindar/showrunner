"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, usePuck, type Config, type Data } from "@puckeditor/core";
import { Monitor, Smartphone, Undo2, Redo2, X, ExternalLink, ArrowLeft, PanelsTopLeft, ChevronRight, ChevronUp, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFieldId, focusContentFieldWhenReady } from "./field-selection";
import { type Choice } from "./editor";
import { ContentFields } from "./content-fields";
import { contentLinkOptions, editorPageDestination, type LinkChoices } from "./field-layout";
import { saveStudioBlock } from "./actions";
import type { ContentBlockConfig, ContentManifest } from "./manifest";
import "@puckeditor/core/puck.css";
import styles from "./puck-editor.module.css";
import fieldStyles from "./studio.module.css";

import { resolveShowcase, type ShowcaseRow } from "./showcase";

type Entry = { block: ContentBlockConfig; payload: Record<string, unknown>; revision: number; pageIds: string[]; choices: Choice[] };
type Props = { manifest: ContentManifest; entries: Entry[]; canUpload: boolean; linkChoices: LinkChoices };
export function PuckContentEditor(props: Props) {
  const config = useMemo<Config>(() => ({ components: Object.fromEntries(props.entries.map(entry => [entry.block.id, {
    label: entry.block.label,
    fields: { payload: { type: "custom", render: ({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) => <div className={fieldStyles.fields}><ContentFields block={entry.block} canUpload={props.canUpload} assetBaseUrl={entry.block.presentation?.assetBaseUrl || props.manifest.previewUrl} value={value} onChange={onChange} choices={entry.choices} linkOptions={contentLinkOptions(props.manifest, props.linkChoices)} /></div> } },
    render: () => <></>
  }])) }), [props.entries, props.canUpload, props.manifest, props.linkChoices]);
  const data = useMemo<Data>(() => ({ root: { props: {} }, content: props.entries.map(entry => ({ type: entry.block.id, props: { id: entry.block.id, payload: entry.payload } })) }), [props.entries]);
  return <Puck config={config} data={data} permissions={{ insert: false, delete: false, duplicate: false, drag: false, edit: true }}><Workspace {...props} /></Puck>;
}

function Workspace({ manifest, entries }: Props) {
  const { appState, dispatch, selectedItem, history } = usePuck();
  const [editing, setEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [fieldRequest, setFieldRequest] = useState<{ id: string; path: unknown } | null>(null);
  const [pageId, setPageId] = useState(manifest.pages[0].id);
  const [pageLocation, setPageLocation] = useState("");
  const [mobile, setMobile] = useState(false);
  const [focusedItem, setFocusedItem] = useState("");
  useEffect(() => {
    const focus = (event: Event) => setFocusedItem((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("showrunner:focus-item", focus);
    return () => window.removeEventListener("showrunner:focus-item", focus);
  }, []);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(Object.fromEntries(entries.map(entry => [entry.block.id, { payload: entry.payload, revision: entry.revision }])));
  const frame = useRef<HTMLIFrameElement>(null);
  const sectionSelector = useRef<HTMLButtonElement>(null);
  const editorEntry = useRef<HTMLButtonElement>(null);
  const editorExit = useRef<HTMLButtonElement>(null);
  const mobileHeading = useRef<HTMLHeadingElement>(null);
  const mobileCardToggle = useRef<HTMLButtonElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const page = manifest.pages.find(item => item.id === pageId)!;
  const pageEntries = useMemo(() => entries.filter(entry => entry.pageIds.includes(pageId) || entry.block.type === "business"), [entries, pageId]);
  const content = appState.data.content;
  useEffect(() => {
    const openRequestedSection = () => {
      const id = new URLSearchParams(window.location.search).get("section") || (window.location.hash === "#business-info-title-heading" ? "business-info" : "");
      const index = entries.findIndex(entry => entry.block.id === id);
      const entry = entries.find(entry => entry.block.id === id);
      if (index < 0 || !entry) return;
      setEditing(true);
      setPanelOpen(true);
      if (entry.pageIds.length) setPageId(entry.pageIds[0]);
      dispatch({ type: "setUi", ui: { itemSelector: { index } } });
    };
    openRequestedSection();
    window.addEventListener("hashchange", openRequestedSection);
    return () => window.removeEventListener("hashchange", openRequestedSection);
  }, [dispatch, entries]);
  const changed = content.filter(item => JSON.stringify(item.props.payload) !== JSON.stringify(saved[item.props.id]?.payload));
  const dirty = changed.length > 0;
  const selected = entries.find(entry => entry.block.id === selectedItem?.props.id);
  const selectedId = selected?.block.id;
  useEffect(() => {
    if (!editing || !selectedId) return;
    const entry = entries.find(entry => entry.block.id === selectedId)!;
    const payload = content.find(item => item.props.id === selectedId)?.props.payload;
    const id = fieldRequest?.id === selectedId && payload ? contentFieldId(selectedId, payload, fieldRequest.path, entry.block.editableFields) : null;
    if (!id || !inspector.current) {
      const close = inspector.current?.querySelector<HTMLButtonElement>("button");
      if (close?.getClientRects().length) close.focus();
      else mobileHeading.current?.focus();
      return;
    }
    return focusContentFieldWhenReady(inspector.current, id);
    // Focus only on an explicit selection, never on each keystroke or draft update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fieldRequest, editing]);
  useEffect(() => {
    if (editing && !selectedId) editorExit.current?.focus();
    else editorEntry.current?.focus();
    // Restore the mode entry point only when entering or leaving the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  function closeInspector() {
    dispatch({ type: "setUi", ui: { itemSelector: null } });
    requestAnimationFrame(() => sectionSelector.current?.focus());
  }
  function closePanel() { setPanelOpen(false); mobileCardToggle.current?.focus(); }
  const siteUrl = manifest.previewUrl ? new URL(pageLocation || page.path, manifest.previewUrl).toString() : "";
  const preview = siteUrl ? new URL(siteUrl) : null;
  preview?.searchParams.set("showrunner-editor", "1");
  const previewUrl = preview?.href || "";
  const previewOrigin = siteUrl ? new URL(siteUrl).origin : "";
  const navigate = useCallback((href: string) => {
    if (pending) return;
    const destination = editorPageDestination(href, siteUrl, manifest.pages);
    if (!destination || destination.href === siteUrl) return;
    setPageId(destination.pageId); setPageLocation(destination.href);
    setReady(false); setFrameError(false); setFocusedItem("");
    setFieldRequest(null);
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  }, [dispatch, manifest.pages, pending, siteUrl]);

  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const followLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (pending || !window.confirm("Leave without publishing? Your unpublished changes will be lost.")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", followLink, true); };
  }, [dirty, pending]);
  useEffect(() => {
    if (!editing || ready || !previewUrl) return;
    // The iframe can finish loading before React hydrates and attaches onLoad.
    const connect = () => frame.current?.contentWindow?.postMessage({ channel: "showrunner-editor-v1", type: "connect" }, previewOrigin);
    const retry = window.setInterval(connect, 1000);
    const timer = window.setTimeout(() => { window.clearInterval(retry); setFrameError(true); }, 20000);
    return () => { window.clearInterval(retry); window.clearTimeout(timer); };
  }, [previewUrl, ready, previewOrigin, editing, previewAttempt]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== previewOrigin || event.data?.channel !== "showrunner-editor-v1") return;
      if (event.data.type === "ready") { setReady(true); setFrameError(false); }
      if (event.data.type === "navigate" && typeof event.data.href === "string") navigate(event.data.href);
      if (event.data.type === "select") {
        const index = content.findIndex(item => item.props.id === event.data.id);
        if (!pending && index >= 0 && pageEntries.some(entry => entry.block.id === event.data.id)) {
          setPanelOpen(true);
          setFieldRequest({ id: event.data.id, path: event.data.field });
          dispatch({ type: "setUi", ui: { itemSelector: { index } } });
        }
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [content, dispatch, pageEntries, previewOrigin, navigate, pending]);
  useEffect(() => {
    if (!ready || !frame.current?.contentWindow) return;
    const mediaUrl = (value: string) => value?.startsWith("/") ? new URL(value, window.location.origin).toString() : value;
    const blocks = pageEntries.map(entry => {
      let payload = content.find(item => item.props.id === entry.block.id)?.props.payload || entry.payload;
      payload = { ...payload, ...(payload.imageUrl ? { imageUrl: mediaUrl(payload.imageUrl) } : {}), ...(Array.isArray(payload.slides) ? { slides: payload.slides.map((slide: Record<string, string>) => ({ ...slide, imageUrl: mediaUrl(slide.imageUrl) })) } : {}), ...(Array.isArray(payload.images) ? { images: payload.images.map((image: Record<string, string>) => ({ ...image, url: mediaUrl(image.url) })) } : {}) };
      if (entry.block.type === "showcase") payload = { ...payload, items: resolveShowcase(payload.items as ShowcaseRow[], entry.choices.flatMap(choice => choice.catalog ? [choice.catalog] : []), manifest).map(item => ({ ...item, imageUrl: mediaUrl(item.imageUrl) })) };
      if (entry.block.source === "services") payload = { ...payload, items: (payload.items as Record<string, string>[]).map(row => {
        const choice = entry.choices.find(item => item.id === row.referenceId);
        return { id: choice?.id, name: row.title || choice?.label || "", description: row.description || choice?.description || "", imageUrl: mediaUrl(choice?.imageUrl || "") };
      }) };
      return { id: entry.block.id, type: entry.block.type, payload, presentation: entry.block.presentation || {} };
    });
    frame.current.contentWindow.postMessage({ channel: "showrunner-editor-v1", type: "update", blocks, selectedId: selected?.block.id, assetOrigin: window.location.origin, focusedItem }, previewOrigin);
  }, [content, ready, pageEntries, previewOrigin, selected?.block.id, focusedItem, manifest]);

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
  function enterEditor() {
    setReady(false); setFrameError(false); setEditing(true); setPanelOpen(false); setSheetExpanded(false);
  }
  if (!editing) return <div className={styles.overview}>
    <header className="page-header"><h1>Content</h1><Button ref={editorEntry} onClick={enterEditor}>Edit website</Button></header>
    {dirty && <p className={styles.saveState} role="status">Your unpublished edits are kept in this visit. The preview below shows the published website.</p>}
    {siteUrl ? <iframe src={siteUrl} title="Your website preview" className={styles.websitePreview} /> : <p>Your website preview has not been connected. Your site administrator can connect it in the content manifest.</p>}
  </div>;
  return <div className={`${styles.workspace} showrunner-content-workspace`}>
    <header className={styles.toolbar}>
      <Button ref={editorExit} variant="ghost" aria-label="Exit editor" disabled={pending} onClick={() => { setEditing(false); setReady(false); }}><ArrowLeft size={17} aria-hidden="true" /><span>Exit editor</span></Button>
      <h1 className="ui-sr-only">Website editor</h1>
      <label className={styles.pageLabel}><span className="ui-sr-only">Page</span><select aria-label="Page" value={pageId} disabled={pending} onChange={event => navigate(manifest.pages.find(page => page.id === event.target.value)!.path)}>{manifest.pages.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <div className={styles.devices} role="group" aria-label="Preview size"><Button variant="ghost" title="Desktop preview" aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={18} /></Button><Button variant="ghost" title="Mobile preview" aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={18} /></Button></div>
      <div className={styles.history}><Button variant="ghost" title="Undo" aria-label="Undo" disabled={!history.hasPast || pending} onClick={history.back}><Undo2 size={17} /></Button><Button variant="ghost" title="Redo" aria-label="Redo" disabled={!history.hasFuture || pending} onClick={history.forward}><Redo2 size={17} /></Button></div>
      <span className={styles.saveState}>{dirty ? "Unpublished changes" : "Up to date"}</span>
      {siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer" title="Open website" aria-label="Open website"><ExternalLink size={17} /></a>}
      <details className={styles.mobileActions}><summary aria-label="Editor actions"><MoreHorizontal size={20} /></summary><div>
        <Button variant="ghost" disabled={!history.hasPast || pending} onClick={history.back}><Undo2 size={17} />Undo</Button>
        <Button variant="ghost" disabled={!history.hasFuture || pending} onClick={history.forward}><Redo2 size={17} />Redo</Button>
        {siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} />Open website</a>}
        <span role="status">{dirty ? "Unpublished changes" : "Up to date"}</span>
      </div></details>
      <Button disabled={!dirty || pending} onClick={publish}>{pending ? "Publishing…" : "Publish"}</Button>
    </header>
    {message && <div className={styles.notice} role={error ? "alert" : "status"}>{message}</div>}
    <div className={styles.body}>
      <aside className={styles.editBar} data-open={panelOpen} data-expanded={sheetExpanded} data-selected={Boolean(selected)} aria-label="Website editing">
        <div className={styles.mobileSheetHeader}>
          {selected && <Button className={styles.sheetAction} variant="ghost" aria-label="Back to sections" onClick={closeInspector}><ArrowLeft size={18} /></Button>}
          <h2 ref={mobileHeading} tabIndex={-1}><Button ref={mobileCardToggle} variant="ghost" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}><span>{selected?.block.label || "Sections"}</span>{!panelOpen && <ChevronUp size={18} />}</Button></h2>
          <Button className={styles.sheetAction} variant="ghost" aria-label={sheetExpanded ? "Reduce editing panel" : "Expand editing panel"} aria-expanded={sheetExpanded} onClick={() => setSheetExpanded(value => !value)}>{sheetExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</Button>
          <Button className={styles.sheetAction} variant="ghost" aria-label="Close editing panel" onClick={closePanel}><ChevronDown size={18} /></Button>
        </div>
        <div className={styles.sectionHeader}><h2>{page.label}</h2><Button variant="ghost" className={styles.mobilePanelButton} aria-label="Show website preview" onClick={() => setPanelOpen(false)}><X size={18} /></Button></div>
        <nav className={styles.sections} aria-label="Page sections">
          {pageEntries.map((entry, index) => <button ref={index === 0 ? sectionSelector : undefined} key={entry.block.id} aria-current={selectedId === entry.block.id ? "true" : undefined} disabled={pending} onClick={() => { setFieldRequest(null); dispatch({ type: "setUi", ui: { itemSelector: { index: content.findIndex(item => item.props.id === entry.block.id) } } }); }}><PanelsTopLeft size={16} aria-hidden="true" /><span>{entry.block.label}</span><ChevronRight size={14} aria-hidden="true" /></button>)}
        </nav>
        {selected ? <section ref={inspector} key={selected.block.id} className={styles.inspector} aria-label="Section settings" onKeyDown={event => { if (event.key === "Escape" && !(event.target as Element).closest("dialog")) { event.stopPropagation(); closeInspector(); } }}><div className={styles.inspectorHeader}><h2>{selected.block.label}</h2><Button variant="ghost" title="Close section settings" aria-label="Close section settings" onClick={closeInspector}><X size={18} /></Button></div><fieldset disabled={pending}><Puck.Fields /></fieldset></section> : <p className={styles.hint}>Choose a section, or click text or an image in the preview to edit it.</p>}
      </aside>
      <div className={styles.previewArea}>
        <div className={styles.canvas}>
          {previewUrl ? <>
            {!ready && <div className={styles.loading} role={frameError ? "alert" : "status"}>{frameError ? <>The website could not connect. <Button variant="secondary" onClick={() => { setFrameError(false); setReady(false); setPreviewAttempt(attempt => attempt + 1); if (frame.current) frame.current.src = previewUrl; }}>Reload preview</Button></> : "Loading your website…"}</div>}
            <iframe ref={frame} key={previewUrl} src={previewUrl} title={`${page.label} website preview`} className={mobile ? styles.mobileFrame : styles.frame} onLoad={() => frame.current?.contentWindow?.postMessage({ channel: "showrunner-editor-v1", type: "connect" }, previewOrigin)} />
          </> : <div className={styles.loading}>Your website preview has not been connected. Your site administrator can connect it in the content manifest.</div>}
        </div>
      </div>
    </div>
  </div>;
}
