"use client";
import { Notification, useNotify } from "@/components/ui/notifications";

import NextImage from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Info,
  File,
  Film,
  FolderOpen,
  Grid2X2,
  LayoutList,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Modal } from "@/components/ui/modal";
import type { MediaTagSummary } from "@/lib/media-tags";
import { childMediaFolders } from "@/lib/media-folders";
import {
  createMediaFolder,
  changeMediaFolder,
  renameMediaAsset,
  deleteMediaAsset,
  moveMediaAssetToFolder,
  restoreMediaAssetAction,
  updateMediaAssetAction
} from "./actions";
import { MediaTagPicker } from "./media-tag-picker";
import { UploadAssetsModal } from "./upload-assets-modal";
import styles from "./media-library.module.css";

export type MediaLibraryAsset = {
  alt: string;
  builtIn?: boolean;
  caption: string;
  createdAt: string;
  credit: string;
  displayUrl: string;
  driver: string;
  filename: string;
  focalPointX: number;
  focalPointY: number;
  folder: string;
  format: string;
  fullUrl: string;
  height: number;
  heroUrl: string;
  id: string;
  isDecorative: boolean;
  isHero: boolean;
  isLogo: boolean;
  isPrivate: boolean;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  updatedAt: string;
  usageContext: string;
  usageCount: number;
  variantCount: number;
  width: number;
};

export type MediaLibraryFilters = {
  folder: string;
  kind: "all" | "image" | "video" | "other";
  page: number;
  q: string;
  scope: "home" | "all" | "recent" | "private" | "needs-alt" | "archived" | "built-in";
  sort: "newest" | "oldest" | "name" | "largest";
  tag: string;
};

type FolderSummary = { count: number; name: string };

type MediaLibraryWorkspaceProps = {
  activeCount: number;
  archivedCount: number;
  assets: MediaLibraryAsset[];
  builtInCount: number;
  canUpload: boolean;
  errorMessage: string;
  filters: MediaLibraryFilters;
  folders: FolderSummary[];
  needsAltCount: number;
  pageCount: number;
  privateCount: number;
  recentCount: number;
  resultCount: number;
  savedMessage: string;
  tags: MediaTagSummary[];
};

type ViewMode = "grid" | "list";

function bytesLabel(bytes: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function hrefWithParams(changes: Record<string, string | number | null>, filters: MediaLibraryFilters) {
  const next = { ...filters } as MediaLibraryFilters;
  Object.entries(changes).forEach(([key, value]) => {
    if (!(key in next)) return;
    if (key === "page") next.page = typeof value === "number" ? value : 1;
    else (next as unknown as Record<string, string>)[key] = value === null ? "" : String(value);
  });

  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.scope && next.scope !== "all") params.set("scope", next.scope);
  if (next.folder) params.set("folder", next.folder);
  if (next.tag) params.set("tag", next.tag);
  if (next.kind && next.kind !== "all") params.set("kind", next.kind);
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));

  const query = params.toString();
  return `/admin/modules/media${query ? `?${query}` : ""}`;
}

function AssetStatus({ asset }: { asset: MediaLibraryAsset }) {
  if (asset.builtIn) return <span className={styles.statusBuiltIn}>Built-in</span>;
  if (asset.isPrivate) return <span className={styles.statusPrivate}><Lock aria-hidden="true" size={12} /> Private</span>;
  if (asset.isDecorative) return <span className={styles.statusNeutral}>Decorative</span>;
  if (!asset.alt) return <span className={styles.statusWarning}>Needs alt</span>;
  return null;
}

function AssetThumbnail({ asset, priority = false }: { asset: MediaLibraryAsset; priority?: boolean }) {
  const isImage = asset.mimeType.startsWith("image/") || asset.builtIn;
  return (
    <span className={styles.thumb}>
      {isImage ? (
        <NextImage alt="" draggable={false} fill priority={priority} sizes="(max-width: 760px) 45vw, (max-width: 1280px) 25vw, 220px" src={asset.displayUrl} unoptimized />
      ) : (
        <span className={styles.fileFallback}>{asset.mimeType.startsWith("video/") ? <Film aria-hidden="true" size={26} /> : <File aria-hidden="true" size={26} />}<small>{asset.format || "FILE"}</small></span>
      )}
    </span>
  );
}

type CardOperation = "rename" | "move" | "delete";
type CardAction = { kind: "file" | "folder"; id: string; name: string; folder: string; operation: CardOperation };

function CardMenu({ name, onAction, disabled }: { name: string; onAction: (operation: CardOperation) => void; disabled: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <details ref={ref} className={styles.cardMenu} onPointerDown={event => event.stopPropagation()}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
    <summary aria-label={`More actions for ${name}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
    <div role="group" aria-label={`Actions for ${name}`}>
      {(["rename", "move", "delete"] as const).map(operation => <Button key={operation} type="button" variant={operation === "delete" ? "danger" : "ghost"} disabled={disabled}
        onClick={() => { if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } onAction(operation); }}>
        {operation === "rename" ? <Pencil size={16} /> : operation === "move" ? <FolderOpen size={16} /> : <Trash2 size={16} />}
        {operation === "rename" ? "Rename" : operation === "move" ? "Move" : "Delete"}
      </Button>)}
    </div>
  </details>;
}

function AssetCard({ asset, index, onSelect, onToggle, onAction, selected, view, movable, pickedUp }: {
  asset: MediaLibraryAsset;
  index: number;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
  onAction: (operation: CardOperation) => void;
  selected: boolean;
  view: ViewMode;
  movable: boolean;
  pickedUp: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className={styles.assetTile} data-media-id={asset.id} data-movable={movable} data-picked-up={pickedUp}>
    <button
      aria-label={`View details for ${asset.filename}`}
      aria-pressed={selected}
      draggable={false}
      className={`${styles.assetCard} ${selected ? styles.assetCardSelected : ""} ${view === "list" ? styles.assetRow : ""}`}
      onClick={onSelect}
      type="button">
      <AssetThumbnail asset={asset} priority={index < 4} />
      <span className={styles.assetCopy}>
        <strong title={asset.filename}>{asset.filename}</strong>
        <small>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.format || "Asset"} · {bytesLabel(asset.sizeBytes)}</small>
      </span>
      <span className={styles.assetMeta}>
        <AssetStatus asset={asset} />
        {asset.usageCount ? <small>{asset.usageCount} {asset.usageCount === 1 ? "use" : "uses"}</small> : null}
      </span>
    </button>
    {movable && <label className={styles.assetCheckbox}><input type="checkbox" aria-label={`Select ${asset.filename}`} checked={selected} onChange={onToggle} /></label>}
    {movable && <CardMenu name={asset.filename} onAction={onAction} disabled={false} />}
    <Button className={styles.infoButton} aria-label={`Information about ${asset.filename}`} type="button" variant="secondary" onPointerDown={event => event.stopPropagation()} onClick={() => setInfoOpen(true)}><Info size={16} aria-hidden="true" /></Button>
    <MediaInfoDialog asset={asset} open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function MediaInfoDialog({ asset, open, onClose }: { asset: MediaLibraryAsset; open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="File information" className={styles.folderModal}>
    <dl className={styles.factGrid}>
      <div><dt>Type</dt><dd>{asset.format || asset.mimeType || "Asset"}</dd></div>
      <div><dt>Dimensions</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd></div>
      <div><dt>File size</dt><dd>{bytesLabel(asset.sizeBytes)}</dd></div>
      <div><dt>Added</dt><dd>{dateLabel(asset.createdAt)}</dd></div>
      <div><dt>Variants</dt><dd>{asset.variantCount || "—"}</dd></div>
    </dl>
  </Modal>;
}

function MetadataForm({ asset, folders, tags, onDelete }: { asset: MediaLibraryAsset; folders: FolderSummary[]; tags: MediaTagSummary[]; onDelete: () => void }) {
  const [decorative, setDecorative] = useState(asset.isDecorative);
  const [selectedTags, setSelectedTags] = useState(asset.tags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notify = useNotify();
  return <form onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const result = await updateMediaAssetAction(data);
      if (result.error) { setError(result.error); return; }
      notify("File details saved.");
    } catch { setError("The file could not be saved. Try again."); }
    finally { setSaving(false); }
  }} className={styles.metadataForm}>
    <input name="id" type="hidden" value={asset.id} />
    <input name="tags" type="hidden" value={selectedTags.join(",")} />
    <input name="usageContext" type="hidden" value={asset.usageContext} />
    <input name="focalPointX" type="hidden" value={asset.focalPointX} />
    <input name="focalPointY" type="hidden" value={asset.focalPointY} />
    {asset.isPrivate && <input name="isPrivate" type="hidden" value="on" />}
    <label className={`${styles.field} ${styles.filenameField}`}><span>Filename</span><input name="filename" defaultValue={asset.filename} required maxLength={200} /></label>
    <label className={styles.field}><span>Folder</span><input defaultValue={asset.folder} name="folder" list="media-folder-options" placeholder="Choose or enter a folder" /></label>
    <datalist id="media-folder-options">{folders.map(folder => <option key={folder.name} value={folder.name} />)}</datalist>
    <MediaTagPicker tags={tags.map(tag => tag.name)} selected={selectedTags} onChange={setSelectedTags} />
    <details className={styles.inspectorSection}>
      <summary>Editorial details</summary>
      <label className={styles.field}><span>Caption</span><textarea defaultValue={asset.caption} name="caption" rows={2} /></label>
      <label className={styles.field}><span>Credit</span><input defaultValue={asset.credit} name="credit" placeholder="Photographer or source" /></label>
    </details>
    <details className={styles.inspectorSection}>
      <summary>Accessibility{!decorative && !asset.alt ? " — needs attention" : ""}</summary>
      <label className={styles.field}><span>Alt text</span><textarea defaultValue={asset.alt} name="alt" placeholder="Describe what matters in this image" rows={3} />
        <small>{decorative ? "Alt text is cleared when the image is decorative." : "Describe the image’s purpose, not every visual detail."}</small></label>
      <label className={styles.checkRow}><span><strong>Decorative image</strong><small>Screen readers will skip this asset.</small></span><input checked={decorative} name="isDecorative" onChange={event => setDecorative(event.currentTarget.checked)} type="checkbox" /></label>
    </details>
    <div className={`module-modal-actions ${styles.inspectorActions}`}>
      <Button disabled={Boolean(asset.usageCount || asset.isHero || asset.isLogo)} onClick={onDelete} size="sm" type="button" variant="danger"><Trash2 aria-hidden="true" size={14} />Delete</Button>
      <Button disabled={saving} size="sm" type="submit">{saving ? "Saving…" : "Save changes"}</Button>
    </div>
    {error && <p role="alert">{error}</p>}
    {asset.usageCount || asset.isHero || asset.isLogo ? <p className={styles.sectionCopy}>This file is in use. Remove its references before deleting it.</p> : null}
  </form>;
}

function AssetInspector({ asset, archived, folders, tags, onClose }: { asset: MediaLibraryAsset; archived: boolean; folders: FolderSummary[]; tags: MediaTagSummary[]; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const notify = useNotify();
  return <Modal open onClose={onClose} title="File details" closeLabel="Close asset details" className={styles.detailsModal}>
    <div className={styles.inspectorScroll}>
      <div className={styles.heroPreview}>
        {asset.mimeType.startsWith("image/") || asset.builtIn ? <NextImage alt={asset.alt || asset.filename} fill sizes="(max-width: 760px) 90vw, 65vw" src={asset.fullUrl} unoptimized />
          : asset.mimeType.startsWith("video/") ? <video src={asset.fullUrl} controls playsInline preload="metadata" aria-label={asset.filename} />
          : <span className={styles.fileFallback}><File aria-hidden="true" size={32} /><small>{asset.format || "FILE"}</small></span>}
        <Button className={styles.infoButton} aria-label={`Information about ${asset.filename}`} type="button" variant="secondary" onClick={() => setInfoOpen(true)}><Info size={18} aria-hidden="true" /></Button>
      </div>
      <div className={styles.inspectorOptions}>
        {archived ? <div className={styles.restoreCard}><h2>{asset.filename}</h2><p>This file is archived.</p><form action={restoreMediaAssetAction}><input name="id" type="hidden" value={asset.id} /><Button size="sm" type="submit" variant="secondary"><RotateCcw size={14} />Restore asset</Button></form></div>
          : asset.builtIn ? <div><h2>{asset.filename}</h2><p>Built-in assets cannot be edited or deleted.</p></div>
          : <MetadataForm folders={folders} tags={tags} asset={asset} onDelete={() => { setError(""); setConfirmDelete(true); }} />}
      </div>
    </div>
    <MediaInfoDialog asset={asset} open={infoOpen} onClose={() => setInfoOpen(false)} />
    <Modal open={confirmDelete} onClose={() => { if (!deleting) setConfirmDelete(false); }} title="Delete file" className={styles.folderModal}>
      <p>Delete “{asset.filename}”? You can restore it from Archived. Files still in use cannot be deleted.</p>
      {error && <p role="alert">{error}</p>}
      <div className="module-modal-actions"><Button type="button" variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button type="button" variant="danger" disabled={deleting} onClick={async () => {
          setDeleting(true); setError("");
          try { const data = new FormData(); data.set("id", asset.id); data.set("confirmArchive", "on"); const result = await deleteMediaAsset(data);
            if (result.error) { setError(result.error); return; }
            notify("File moved to Archived."); onClose(); router.refresh();
          } catch { setError("The file could not be deleted. Try again."); } finally { setDeleting(false); }
        }}>{deleting ? "Deleting…" : "Delete"}</Button></div>
    </Modal>
  </Modal>;
}

export function MediaLibraryWorkspace({
  activeCount,
  archivedCount,
  assets,
  builtInCount,
  canUpload,
  errorMessage,
  filters,
  folders,
  needsAltCount,
  pageCount,
  privateCount,
  recentCount,
  resultCount,
  savedMessage,
  tags
}: MediaLibraryWorkspaceProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFolder, setUploadFolder] = useState("");
  const [externalDropFolder, setExternalDropFolder] = useState<string | null>(null);
  function openUpload(files: File[] = [], folder = filters.folder) {
    setUploadFiles(files); setUploadFolder(folder); setUploadOpen(true);
  }
  const [folderOpen, setFolderOpen] = useState(false);
  const [cardAction, setCardAction] = useState<CardAction | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  const [needsDestination, setNeedsDestination] = useState(false);
  const migrateContents = cardAction?.kind === "folder" && cardAction.operation === "delete" && (needsDestination || folders.some(folder => (folder.name === cardAction.id && folder.count > 0) || folder.name.startsWith(`${cardAction.id}/`)));
  function openCardAction(action: CardAction) { setCardError(""); setNeedsDestination(false); setCardAction(action); }
  const notify = useNotify();
  const [folderBusy, setFolderBusy] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const movePending = useRef(false);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [movedIds, setMovedIds] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const gesture = useRef<{ kind: "files" | "box"; id?: string; ids: string[]; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const previousRects = useRef(new Map<string, DOMRect>());
  const childFolders = childMediaFolders(folders, filters.folder);
  const browsingHome = filters.scope === "all" && !filters.folder && !filters.q && !filters.tag && filters.kind === "all";
  const visibleAssets = assets.filter(asset => !movedIds.includes(asset.id));
  const layoutKey = visibleAssets.map(asset => asset.id).join(",");
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    resultsRef.current?.querySelectorAll<HTMLElement>("[data-media-id]").forEach(element => {
      const id = element.dataset.mediaId!;
      const bounds = element.getBoundingClientRect();
      const before = previousRects.current.get(id);
      if (before && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && (before.x !== bounds.x || before.y !== bounds.y)) {
        element.animate([{ transform: `translate(${before.x - bounds.x}px, ${before.y - bounds.y}px)` }, { transform: "translate(0, 0)" }], { duration: 180, easing: "ease-out" });
      }
      next.set(id, bounds);
    });
    previousRects.current = next;
  }, [layoutKey]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") { gesture.current = null; setDrag(null); setSelectionBox(null); setDropFolder(null); }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterCount = Number(filters.scope !== "all") + Number(Boolean(filters.folder)) + Number(Boolean(filters.tag)) + Number(filters.kind !== "all");
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const [view, setView] = useState<ViewMode>("grid");
  const selectedAsset = assets.find((asset) => asset.id === selectedId) || null;


  function navigate(changes: Record<string, string | number | null>) {
    setSelectedId(null);
    setSelectedIds([]);
    if ("q" in changes) setSearchValue(String(changes.q || ""));
    router.push(hrefWithParams({ page: null, ...changes }, filters));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchValue.trim() || null });
  }

  async function moveToFolder(ids: string[], folder: string) {
    if (movePending.current) return;
    const moving = assets.filter(asset => ids.includes(asset.id) && !asset.builtIn && asset.folder !== folder);
    if (!moving.length || filters.scope === "archived") return;
    movePending.current = true;
    setMoveBusy(true);
    setPendingIds(moving.map(asset => asset.id));
    try {
      const data = new FormData();
      moving.forEach(asset => data.append("id", asset.id));
      data.set("folder", folder);
      const result = await moveMediaAssetToFolder(data);
      if (result.error) throw new Error(result.error);
      setMovedIds(current => [...current, ...moving.map(asset => asset.id)]);
      notify(`Moved ${moving.length === 1 ? moving[0].filename : `${moving.length} files`} to ${folder || "Media home"}.`);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "The files could not be moved. Please try again.", "danger");
    }
    finally { movePending.current = false; setMoveBusy(false); setPendingIds([]); }
  }

  function beginGesture(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || event.pointerType !== "mouse" || moveBusy) return;
    suppressClick.current = false;
    const target = event.target as HTMLElement;
    if (target.closest("input, label, select, details, dialog, [data-folder-path], nav")) return;
    const tile = target.closest<HTMLElement>("[data-media-id]");
    if (tile && tile.dataset.movable !== "true") return;
    if (!tile && target.closest("button, a")) return;
    if (tile && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
    const id = tile?.dataset.mediaId;
    gesture.current = { kind: id ? "files" : "box", id, ids: id ? (selectedIds.includes(id) ? selectedIds : [id]) : (event.ctrlKey || event.metaKey || event.shiftKey ? selectedIds : []), x: event.clientX, y: event.clientY, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function updateGesture(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    current.active = true;
    suppressClick.current = true;
    if (current.kind === "files") {
      setDrag({ ids: current.ids, x: event.clientX, y: event.clientY });
      const folder = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-folder-path]");
      setDropFolder(folder?.dataset.folderPath ?? null);
    } else {
      const box = { left: Math.min(current.x, event.clientX), top: Math.min(current.y, event.clientY), width: Math.abs(event.clientX - current.x), height: Math.abs(event.clientY - current.y) };
      setSelectionBox(box);
      const ids = [...current.ids];
      resultsRef.current?.querySelectorAll<HTMLElement>('[data-media-id][data-movable="true"]').forEach(tile => {
        const rect = tile.getBoundingClientRect();
        if (rect.right > box.left && rect.left < box.left + box.width && rect.bottom > box.top && rect.top < box.top + box.height) ids.push(tile.dataset.mediaId!);
      });
      setSelectedIds([...new Set(ids)]);
    }
  }

  function finishGesture(event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    const current = gesture.current;
    gesture.current = null;
    if (current?.active && current.kind === "files" && !cancelled && dropFolder !== null) void moveToFolder(current.ids, dropFolder);
    if (current?.kind === "box" && !current.active && !cancelled) setSelectedIds(current.ids);
    if (current?.kind === "files" && !current.active && !cancelled) { setSelectedId(current.id!); suppressClick.current = true; }
    setDrag(null); setSelectionBox(null); setDropFolder(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleSelection(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  return (
    <div className={`stack ${styles.page}`} data-dragging={Boolean(drag)}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes("Files") || (event.target as HTMLElement).closest("dialog")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = canUpload ? "copy" : "none";
        setExternalDropFolder((event.target as HTMLElement).closest<HTMLElement>("[data-folder-path]")?.dataset.folderPath ?? filters.folder);
      }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExternalDropFolder(null); }}
      onDrop={event => {
        if ((event.target as HTMLElement).closest("dialog")) return;
        event.preventDefault(); setExternalDropFolder(null);
        if (!canUpload) { notify("Uploads are temporarily unavailable.", "danger"); return; }
        const files = Array.from(event.dataTransfer.files);
        if (!files.length) return;
        const folder = (event.target as HTMLElement).closest<HTMLElement>("[data-folder-path]")?.dataset.folderPath ?? filters.folder;
        openUpload(files, folder);
      }}>
      {externalDropFolder !== null && <div className={styles.uploadDropNotice} role="status"><Upload size={20} aria-hidden="true" />{canUpload ? `Drop to upload to ${externalDropFolder || "Media home"}` : "Uploads are temporarily unavailable"}</div>}
      <header className="page-header">
        <h1>Media</h1>
        <div className={styles.pageActions}>
          <Button variant="secondary" onClick={() => setFolderOpen(true)}>New folder</Button>
          <Button onClick={() => openUpload()} type="button"><Upload aria-hidden="true" size={16} /> Upload</Button>
        </div>
      </header>

      <Modal open={Boolean(cardAction)} onClose={() => { if (!cardBusy) setCardAction(null); }} title={cardAction ? `${cardAction.operation === "rename" ? "Rename" : cardAction.operation === "move" ? "Move" : "Delete"} ${cardAction.kind === "file" ? "file" : "folder"}` : "Card actions"} className={styles.folderModal}>
        {cardAction && <form key={`${cardAction.kind}:${cardAction.id}:${cardAction.operation}`} className={styles.newFolder}
          onSubmit={async event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setCardBusy(true); setCardError("");
            try {
              const result = cardAction.kind === "folder" ? await changeMediaFolder(data) : cardAction.operation === "rename" ? await renameMediaAsset(data) : cardAction.operation === "delete" ? await deleteMediaAsset(data) : await moveMediaAssetToFolder(data);
              if (result.error) { setCardError(result.error); if ("needsDestination" in result && result.needsDestination) setNeedsDestination(true); return; }
              notify(cardAction.operation === "rename" ? "Name updated." : cardAction.operation === "move" ? "Moved successfully." : cardAction.kind === "folder" ? "Folder deleted." : "File moved to Archived.");
              setCardAction(null); setSelectedIds([]); router.refresh();
            } catch { setCardError("The change could not be saved. Please try again."); }
            finally { setCardBusy(false); }
          }}>
          <input type="hidden" name="id" value={cardAction.id} />
          <input type="hidden" name="operation" value={cardAction.operation} />
          {cardAction.kind === "folder" && <input type="hidden" name="folder" value={cardAction.id} />}
          {cardAction.operation === "rename" && <label>Name<input autoFocus name={cardAction.kind === "folder" ? "value" : "name"} defaultValue={cardAction.name} required maxLength={200} disabled={cardBusy} /></label>}
          {(cardAction.operation === "move" || migrateContents) && <label>{migrateContents ? "Move contents to" : "Destination folder"}<select autoFocus name={migrateContents ? "migrateTo" : cardAction.kind === "folder" ? "value" : "folder"} defaultValue={migrateContents ? "" : cardAction.folder} disabled={cardBusy}>
            <option value="">Media home</option>
            {[...new Set(folders.flatMap(folder => folder.name.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/"))))]
              .filter(folder => cardAction.kind !== "folder" || (folder !== cardAction.id && !folder.startsWith(`${cardAction.id}/`)))
              .sort((a, b) => a.localeCompare(b)).map(folder => <option key={folder} value={folder}>{folder}</option>)}
          </select></label>}
          {cardAction.operation === "delete" && <>
            <input type="hidden" name="confirmArchive" value="on" /><input type="hidden" name="value" value="" />
            <p>Delete “{cardAction.name}”? {cardAction.kind === "file" ? "You can restore it from Archived. Files still in use cannot be deleted." : migrateContents ? "Its files and subfolders will be moved to the destination you choose." : ""}</p>
          </>}
          {cardError && <p role="alert">{cardError}</p>}
          <div className="module-modal-actions">
            <Button type="button" variant="secondary" disabled={cardBusy} onClick={() => setCardAction(null)}>Cancel</Button>
            <Button type="submit" variant={cardAction.operation === "delete" ? "danger" : "primary"} disabled={cardBusy}>{cardBusy ? "Saving…" : cardAction.operation === "rename" ? "Save name" : cardAction.operation === "move" ? "Move" : "Delete"}</Button>
          </div>
        </form>}
      </Modal>

      <Modal open={folderOpen} onClose={() => { if (!folderBusy) setFolderOpen(false); }} title="New folder" className={styles.folderModal}>
      <form className={styles.newFolder} onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setFolderBusy(true);
        try {
          const result = await createMediaFolder(data);
          if (result.error) notify(result.error, "danger");
          else { notify("Folder created. Drag files into it below."); setFolderOpen(false); navigate({ scope: "all", folder: filters.folder || null, q: null, tag: null, kind: null }); router.refresh(); }
        } catch { notify("The folder could not be created. Please try again.", "danger"); }
        finally { setFolderBusy(false); }
      }}>
        <input name="parent" type="hidden" value={filters.folder} />
        <label>Folder name<input autoFocus name="name" required maxLength={200} placeholder="e.g. Events" disabled={folderBusy} /></label>
        <div className="module-modal-actions">
          <Button type="button" variant="secondary" disabled={folderBusy} onClick={() => setFolderOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={folderBusy}>{folderBusy ? "Creating…" : "Create folder"}</Button>
        </div>
      </form>
      </Modal>
      {savedMessage ? <Notification queryKey="saved">{savedMessage}</Notification> : null}
      {errorMessage ? <Notification tone="danger" queryKey="error">{errorMessage}</Notification> : null}

      <div className={styles.libraryWorkspace}>
        <section className={styles.libraryMain} aria-label="Media library">
          <div className={styles.libraryHeader}>
            <div>
              <p>{browsingHome ? activeCount : resultCount} {(browsingHome ? activeCount : resultCount) === 1 ? "file" : "files"}{filters.q ? ` matching “${filters.q}”` : ""}</p>
            </div>
          </div>

          <div className={styles.toolbar}>
            <form className={styles.librarySearch} onSubmit={submitSearch} role="search">
              <Search aria-hidden="true" size={17} />
              <label className="ui-sr-only" htmlFor="media-library-search">Search assets</label>
              <input id="media-library-search" onChange={(event) => setSearchValue(event.currentTarget.value)} placeholder="Search files" type="search" value={searchValue} />
              <button aria-label="Search files" type="submit"><Search size={15} /></button>
              {searchValue ? <button aria-label="Clear search" onClick={() => { setSearchValue(""); navigate({ q: null }); }} type="button"><X size={15} /></button> : null}
            </form>

            <div className={styles.filterMenu} ref={filterRef} onKeyDown={event => {
              if (event.key === "Escape") {
                setFiltersOpen(false);
                filterRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              }
            }} onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFiltersOpen(false);
            }}>
              <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="media-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
                <SlidersHorizontal aria-hidden="true" size={16} /> Filters{filterCount ? ` (${filterCount})` : ""}
              </Button>
              {filtersOpen && <div id="media-filters" className={styles.filterPopover} role="region" aria-label="Filter files">
              <label className={styles.selectControl}>
                <span >Media category</span>
                <select aria-label="Media category" value={filters.scope} onChange={event => navigate({ scope: event.currentTarget.value, folder: null, tag: null })}>
                  <option value="all">Library ({activeCount})</option>
                  <option value="recent">Recently added ({recentCount})</option>
                  <option value="private">Private ({privateCount})</option>
                  <option value="needs-alt">Needs alt text ({needsAltCount})</option>
                  <option value="built-in">Built-in ({builtInCount})</option>
                  <option value="archived">Archived ({archivedCount})</option>
                </select>
              </label>
              {folders.length ? <label className={styles.selectControl}>
                <span >Folder</span>
                <select aria-label="Folder" value={filters.folder} onChange={event => navigate({ folder: event.currentTarget.value || null })}>
                  <option value="">All folders</option>
                  {folders.filter(folder => folder.name).map(folder => <option key={folder.name} value={folder.name}>{folder.name} ({folder.count})</option>)}
                </select>
              </label> : null}




            <label className={styles.selectControl}>
              <span >Asset type</span>
              <select aria-label="Asset type" onChange={(event) => navigate({ kind: event.currentTarget.value })} value={filters.kind}>
                <option value="all">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="other">Other files</option>
              </select>
            </label>

            {tags.length ? (
              <label className={styles.selectControl}>
                <span >Filter by tag</span>
                <select aria-label="Filter by tag" onChange={(event) => navigate({ tag: event.currentTarget.value || null })} value={filters.tag}>
                  <option value="">All tags</option>
                  {tags.map((tag) => <option key={tag.name} value={tag.name}>#{tag.name} ({tag.count})</option>)}
                </select>
              </label>
            ) : null}

              </div>}
            </div>
            <SelectMenu id="media-sort" className={styles.sortMenu} label="Sort assets" name="sort" value={filters.sort}
              onValueChange={sort => navigate({ sort })}
              options={[{value: "newest", label: "Newest first"}, {value: "oldest", label: "Oldest first"}, {value: "name", label: "Filename A–Z"}, {value: "largest", label: "Largest first"}]} />

            <div className={styles.viewToggle} aria-label="Asset view">
              <button aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} type="button"><Grid2X2 size={16} /></button>
              <button aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} type="button"><LayoutList size={16} /></button>
            </div>

          </div>

          <div className={styles.activeFilters}>
            {filters.q || filterCount ? (<>
              <span>Filtered by</span>
              {filters.scope !== "all" ? <button onClick={() => navigate({ scope: "all" })} type="button">{({home: "All files", recent: "Recently added", private: "Private", "needs-alt": "Needs alt text", "built-in": "Built-in", archived: "Archived"})[filters.scope]}<X size={12} /></button> : null}
              {filters.q ? <button onClick={() => navigate({ q: null })} type="button">Search: {filters.q}<X size={12} /></button> : null}
              {filters.folder ? <button onClick={() => navigate({ folder: null })} type="button">Folder: {filters.folder}<X size={12} /></button> : null}
              {filters.tag ? <button onClick={() => navigate({ tag: null })} type="button">Tag: {filters.tag}<X size={12} /></button> : null}
              {filters.kind !== "all" ? <button onClick={() => navigate({ kind: null })} type="button">Type: {filters.kind}<X size={12} /></button> : null}
              <button className={styles.clearFilters} onClick={() => navigate({ scope: "all", folder: null, kind: null, q: null, tag: null })} type="button">Clear all</button>
            </>) : null}
          </div>

          {selectedIds.length > 0 && <div className={styles.selectionActions}>
            <span role="status">{selectedIds.length} selected</span>
            <label>Move to <select aria-label="Move selected files to folder" disabled={moveBusy} value="" onChange={event => {
              if (event.currentTarget.value) void moveToFolder(selectedIds, event.currentTarget.value.slice(7));
            }}>
              <option value="">Choose folder</option>
              <option value="folder:">Media home</option>
              {folders.map(folder => <option key={folder.name} value={`folder:${folder.name}`}>{folder.name}</option>)}
            </select></label>
            <Button type="button" variant="ghost" onClick={() => setSelectedIds([])} disabled={moveBusy}>Clear selection</Button>
          </div>}

          <section aria-label="Asset results" className={styles.resultArea} ref={resultsRef}
            onPointerDown={beginGesture} onPointerMove={updateGesture} onPointerUp={event => finishGesture(event)}
            onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => { if (gesture.current) finishGesture(event, true); }} onDragStart={event => event.preventDefault()}>
            <nav aria-label="Folder path" className={styles.folderPath}>
              <Button type="button" variant="secondary" aria-label="Back to parent folder" disabled={!filters.folder || moveBusy}
                onClick={() => navigate({ folder: filters.folder.split("/").slice(0, -1).join("/") || null })}><ChevronLeft size={16} aria-hidden="true" />Back</Button>
              <ol>
                <li><Button type="button" variant="ghost" className={styles.breadcrumb} data-folder-path="" data-drop-active={dropFolder === "" || externalDropFolder === ""} aria-current={!filters.folder ? "page" : undefined} onClick={() => navigate({ folder: null })}>Media home</Button></li>
                {filters.folder.split("/").filter(Boolean).map((part, index, parts) => {
                  const path = parts.slice(0, index + 1).join("/");
                  return <li key={path}><ChevronRight size={14} aria-hidden="true" /><Button type="button" variant="ghost" className={styles.breadcrumb} data-folder-path={path} data-drop-active={dropFolder === path || externalDropFolder === path} aria-current={path === filters.folder ? "page" : undefined} onClick={() => navigate({ folder: path })}>{part}</Button></li>;
                })}
              </ol>
            </nav>
            <div className={view === "grid" ? styles.assetGrid : styles.assetList}>
            {childFolders.length > 0 && <nav aria-label="Media folders" className={styles.folderBrowser} aria-busy={moveBusy}>
              {childFolders.map(folder => (
                <div key={folder.name} className={styles.assetTile} data-folder-path={folder.name}>
                <button className={`${styles.assetCard} ${styles.folderTarget} ${view === "list" ? styles.assetRow : ""}`}
                  type="button" data-folder-path={folder.name}
                  aria-pressed={filters.folder === folder.name} data-drop-active={dropFolder === folder.name || externalDropFolder === folder.name}
                  disabled={moveBusy} title={`Open ${folder.name}, or drop a file here`}
                  onClick={() => navigate({ folder: folder.name })}
                  >
                  <span className={`${styles.thumb} ${styles.folderThumb}`}><FolderOpen aria-hidden="true" size={64} strokeWidth={1.5} /></span>
                  <span className={styles.assetCopy}><strong title={folder.label}>{folder.label}</strong><small>{folder.count} {folder.count === 1 ? "file" : "files"}</small></span>
                </button>
                <CardMenu name={folder.label} disabled={moveBusy || cardBusy} onAction={operation => openCardAction({ kind: "folder", id: folder.name, name: folder.label, folder: filters.folder, operation })} />
                </div>
              ))}
            </nav>}
                {visibleAssets.map((asset, index) => (
                  <AssetCard asset={asset} pickedUp={Boolean(drag?.ids.includes(asset.id) || pendingIds.includes(asset.id))} movable={!asset.builtIn && filters.scope !== "archived" && !moveBusy} index={index + (filters.page - 1) * 24} key={asset.id}
                    onSelect={event => {
                      if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; }
                      if (!asset.builtIn && filters.scope !== "archived" && (event.ctrlKey || event.metaKey || event.shiftKey)) toggleSelection(asset.id);
                      else setSelectedId(asset.id);
                    }} onToggle={() => toggleSelection(asset.id)} onAction={operation => openCardAction({ kind: "file", id: asset.id, name: asset.filename, folder: asset.folder, operation })} selected={selectedIds.includes(asset.id)} view={view} />
                ))}
              </div>
            {!assets.length && !childFolders.length && (
              <div className={styles.emptyState}>
                <span><FolderOpen aria-hidden="true" size={25} /></span>
                <h3>{filters.q || filters.tag || filters.kind !== "all" ? "No assets match this view" : filters.folder ? "This folder is empty" : filters.scope === "archived" ? "Your archive is empty" : filters.scope === "all" ? "No files yet" : "No files in this category"}</h3>
                <p>{filters.q || filters.tag || filters.kind !== "all" ? "Try another search or clear your filters." : filters.folder ? "Upload media here, or assign existing files to this folder in their details." : filters.scope === "archived" ? "Assets you archive will stay recoverable here." : filters.scope === "all" ? "Upload media to use across your website and business." : "Choose another category to browse your files."}</p>
                {filters.q || filters.tag || filters.kind !== "all" ? (
                  <Button onClick={() => navigate({ scope: "all", folder: null, kind: null, q: null, tag: null })} size="sm" type="button" variant="secondary">Clear filters</Button>
                ) : filters.scope === "all" ? (
                  <Button onClick={() => openUpload()} size="sm" type="button"><Upload size={15} /> Upload media</Button>
                ) : null}
              </div>
            )}
          </section>
          {selectionBox && <div aria-hidden="true" className={styles.selectionBox} style={selectionBox} />}
          {drag && <div className={styles.dragPreview} style={{ left: drag.x + 16, top: drag.y + 16 }} role="status">
            <AssetThumbnail asset={assets.find(asset => asset.id === drag.ids[0])!} />
            <strong>{drag.ids.length === 1 ? assets.find(asset => asset.id === drag.ids[0])?.filename : `${drag.ids.length} files`}</strong>
            <small>{dropFolder !== null ? `Move to ${dropFolder || "Media home"}` : "Drop onto a folder · Esc to cancel"}</small>
          </div>}

          {pageCount > 1 ? (
            <nav aria-label="Asset pages" className={styles.pagination}>
              <Button disabled={filters.page <= 1} onClick={() => router.push(hrefWithParams({ page: Math.max(1, filters.page - 1) }, filters))} size="sm" type="button" variant="ghost"><ChevronLeft size={15} /> Previous</Button>
              <span>Page {filters.page} of {pageCount}</span>
              <Button disabled={filters.page >= pageCount} onClick={() => router.push(hrefWithParams({ page: Math.min(pageCount, filters.page + 1) }, filters))} size="sm" type="button" variant="ghost">Next <ChevronRight size={15} /></Button>
            </nav>
          ) : null}
        </section>

        {selectedAsset ? <AssetInspector tags={tags} folders={folders} archived={filters.scope === "archived"} asset={selectedAsset} key={selectedAsset?.id || filters.scope} onClose={() => setSelectedId(null)} /> : null}
      </div>

      <UploadAssetsModal folders={folders.map(folder => folder.name)} defaultFolder={uploadFolder} initialFiles={uploadFiles} canUpload={canUpload} onClose={() => { setUploadOpen(false); setUploadFiles([]); }} open={uploadOpen} />
    </div>
  );
}
