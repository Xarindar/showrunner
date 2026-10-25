"use client";
import { Notification, useNotify } from "@/components/ui/notifications";

import NextImage from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  SlidersHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  File,
  FolderOpen,
  Grid2X2,
  LayoutList,
  Lock,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Modal } from "@/components/ui/modal";
import type { MediaTagSummary } from "@/lib/media-tags";
import {
  archiveMediaAssetAction,
  createMediaFolder,
  restoreMediaAssetAction,
  setHeroImageAction,
  updateMediaAssetAction
} from "./actions";
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
  kind: "all" | "image" | "other";
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
        <NextImage alt="" fill priority={priority} sizes="(max-width: 760px) 45vw, (max-width: 1280px) 25vw, 220px" src={asset.displayUrl} unoptimized />
      ) : (
        <span className={styles.fileFallback}><File aria-hidden="true" size={26} /><small>{asset.format || "FILE"}</small></span>
      )}
    </span>
  );
}

function AssetCard({ asset, index, onSelect, selected, view }: {
  asset: MediaLibraryAsset;
  index: number;
  onSelect: () => void;
  selected: boolean;
  view: ViewMode;
}) {
  return (
    <button
      aria-label={`View details for ${asset.filename}`}
      aria-pressed={selected}
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
      <span aria-hidden="true" className={styles.selectedMark}><Check size={14} strokeWidth={3} /></span>
    </button>
  );
}

function MetadataForm({ asset, folders, onArchive }: { asset: MediaLibraryAsset; folders: FolderSummary[]; onArchive: () => void }) {
  const [decorative, setDecorative] = useState(asset.isDecorative);
  const [focalX, setFocalX] = useState(asset.focalPointX);
  const [focalY, setFocalY] = useState(asset.focalPointY);

  return (
    <form action={updateMediaAssetAction} className={styles.metadataForm}>
      <input name="id" type="hidden" value={asset.id} />

      <div className={styles.inspectorSection}>
        <div className={styles.sectionLabel}>
          <span>Accessibility</span>
          {!decorative && !asset.alt ? <small className={styles.attentionText}>Needs attention</small> : null}
        </div>
        <label className={styles.field}>
          <span>Alt text</span>
          <textarea defaultValue={asset.alt} name="alt" placeholder="Describe what matters in this image" rows={3} />
          <small>{decorative ? "Alt text is cleared when the image is decorative." : "Describe the image’s purpose, not every visual detail."}</small>
        </label>
        <label className={styles.checkRow}>
          <span>
            <strong>Decorative image</strong>
            <small>Screen readers will skip this asset.</small>
          </span>
          <input checked={decorative} name="isDecorative" onChange={(event) => setDecorative(event.currentTarget.checked)} type="checkbox" />
        </label>
      </div>

      <div className={styles.inspectorSection}>
        <div className={styles.sectionLabel}><span>Organization</span></div>
        <label className={styles.field}>
          <span>Folder</span>
          <input defaultValue={asset.folder} name="folder" list="media-folder-options" placeholder="Choose or enter a folder" />
        </label>
        <datalist id="media-folder-options">{folders.map(folder => <option key={folder.name} value={folder.name} />)}</datalist>
        <label className={styles.field}>
          <span>Tags</span>
          <input defaultValue={asset.tags.join(", ")} name="tags" placeholder="portrait, homepage, campaign" />
        </label>
        <label className={styles.field}>
          <span>Usage context</span>
          <input defaultValue={asset.usageContext} name="usageContext" placeholder="homepage, proofing, product" />
        </label>
      </div>

      <div className={styles.inspectorSection}>
        <div className={styles.sectionLabel}><span>Editorial details</span></div>
        <label className={styles.field}>
          <span>Caption</span>
          <textarea defaultValue={asset.caption} name="caption" rows={2} />
        </label>
        <label className={styles.field}>
          <span>Credit</span>
          <input defaultValue={asset.credit} name="credit" placeholder="Photographer or source" />
        </label>
      </div>

      {asset.mimeType.startsWith("image/") ? (
        <div className={styles.inspectorSection}>
          <div className={styles.sectionLabel}>
            <span>Focal point</span>
            <small>{focalX.toFixed(2)}, {focalY.toFixed(2)}</small>
          </div>
          <div className={styles.focalPreview}>
            <NextImage alt="" fill sizes="300px" src={asset.displayUrl} unoptimized />
            <span aria-hidden="true" className={styles.focalMarker} style={{ "--focal-x": `${focalX * 100}%`, "--focal-y": `${focalY * 100}%` } as CSSProperties} />
          </div>
          <label className={styles.rangeField}>
            <span>Horizontal</span>
            <input max="1" min="0" name="focalPointX" onChange={(event) => setFocalX(Number(event.currentTarget.value))} step="0.01" type="range" value={focalX} />
          </label>
          <label className={styles.rangeField}>
            <span>Vertical</span>
            <input max="1" min="0" name="focalPointY" onChange={(event) => setFocalY(Number(event.currentTarget.value))} step="0.01" type="range" value={focalY} />
          </label>
        </div>
      ) : (
        <>
          <input name="focalPointX" type="hidden" value={asset.focalPointX} />
          <input name="focalPointY" type="hidden" value={asset.focalPointY} />
        </>
      )}

      <div className={styles.inspectorSection}>
        <label className={styles.checkRow}>
          <span>
            <strong>Private delivery</strong>
            <small>{asset.isPrivate ? "Require signed access instead of a public URL." : "Upload a new private copy to protect a previously public file."}</small>
          </span>
          <input defaultChecked={asset.isPrivate} disabled={!asset.isPrivate} name="isPrivate" type="checkbox" />
        </label>
      </div>

      <div className={`module-modal-actions ${styles.inspectorActions}`}>
        <Button disabled={Boolean(asset.usageCount || asset.isHero || asset.isLogo)} onClick={onArchive} size="sm" type="button" variant="ghost">
          <Archive aria-hidden="true" size={14} /> Archive
        </Button>
        <Button size="sm" type="submit">Save changes</Button>
      </div>
      {asset.usageCount || asset.isHero || asset.isLogo ? <p className={styles.sectionCopy}>This asset is in use and is protected from archiving. Gallery and purchased photo references are included.</p> : null}
    </form>
  );
}

function AssetInspector({ asset, archived, folders, onClose }: { asset: MediaLibraryAsset; archived: boolean; folders: FolderSummary[]; onClose: () => void }) {
  const [confirmArchive, setConfirmArchive] = useState(false);

  const totalUsageCount = asset.usageCount + (asset.isHero ? 1 : 0) + (asset.isLogo ? 1 : 0);

  return (
    <Modal open onClose={onClose} title={asset.filename} closeLabel="Close asset details" className={styles.detailsModal}>
        <div className={styles.inspectorScroll}>
          <div className={styles.heroPreview}>
            {asset.mimeType.startsWith("image/") || asset.builtIn ? (
              <NextImage alt={asset.alt || asset.filename} fill sizes="340px" src={asset.fullUrl} unoptimized />
            ) : (
              <span className={styles.fileFallback}><File aria-hidden="true" size={32} /><small>{asset.format || "FILE"}</small></span>
            )}
          </div>

          <div className={styles.inspectorSummary}>
            <div>
              <AssetStatus asset={asset} />
              {asset.isHero ? <span className={styles.statusHero}><Star aria-hidden="true" size={12} /> Hero</span> : null}
              {asset.isLogo ? <span className={styles.statusNeutral}>Site logo</span> : null}
            </div>
            <h2>{asset.filename}</h2>
            <p>{asset.caption || asset.alt || "No description added yet."}</p>
          </div>

          <dl className={styles.factGrid}>
            <div><dt>Type</dt><dd>{asset.format || asset.mimeType || "Asset"}</dd></div>
            <div><dt>Dimensions</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd></div>
            <div><dt>File size</dt><dd>{bytesLabel(asset.sizeBytes)}</dd></div>
            <div><dt>Added</dt><dd>{dateLabel(asset.createdAt)}</dd></div>
            <div><dt>Variants</dt><dd>{asset.variantCount || "—"}</dd></div>
          </dl>

          {totalUsageCount ? (
            <div className={styles.usageCard}>
              <Eye aria-hidden="true" size={17} />
              <div>
                <strong>Used in {totalUsageCount} {totalUsageCount === 1 ? "place" : "places"}</strong>
                <p>{[asset.isHero ? "homepage hero" : "", asset.isLogo ? "site logo" : "", asset.usageCount ? `${asset.usageCount} linked record${asset.usageCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")}.</p>
              </div>
            </div>
          ) : null}

          {archived ? (
            <div className={styles.restoreCard}>
              <Trash2 aria-hidden="true" size={19} />
              <div><strong>This asset is archived</strong><p>Restore it to make it available in pickers and active views again.</p></div>
              <form action={restoreMediaAssetAction}>
                <input name="id" type="hidden" value={asset.id} />
                <Button size="sm" type="submit" variant="secondary"><RotateCcw size={14} /> Restore asset</Button>
              </form>
            </div>
          ) : asset.builtIn ? (
            <div className={styles.inspectorSection}>
              <div className={styles.sectionLabel}><span>Global asset</span></div>
              <p className={styles.sectionCopy}>Built-in assets ship with the app and are always available. They cannot be edited or archived.</p>
            </div>
          ) : (
            <MetadataForm folders={folders} asset={asset} onArchive={() => setConfirmArchive(true)} />
          )}

          {!archived && !asset.isPrivate && (asset.mimeType.startsWith("image/") || asset.builtIn) ? (
            <form action={setHeroImageAction} className={styles.heroAction}>
              <input name="url" type="hidden" value={asset.heroUrl} />
              <div><Star aria-hidden="true" size={17} /><span><strong>Homepage hero</strong><small>Use this asset in the primary hero presentation.</small></span></div>
              <Button size="sm" type="submit" variant="secondary">{asset.isHero ? "Refresh hero" : "Use as hero"}</Button>
            </form>
          ) : null}

          {confirmArchive ? (
            <div className={styles.archiveConfirm} role="alert" aria-label={`Archive ${asset.filename}`}>
              <div><Trash2 aria-hidden="true" size={18} /><span><strong>Archive this asset?</strong><small>It will disappear from active pickers. Assets still in use cannot be archived.</small></span></div>
              <div>
                <Button onClick={() => setConfirmArchive(false)} size="sm" type="button" variant="ghost">Cancel</Button>
                <form action={archiveMediaAssetAction}>
                  <input name="id" type="hidden" value={asset.id} />
                  <input name="confirmArchive" type="hidden" value="on" />
                  <Button size="sm" type="submit" variant="danger">Archive asset</Button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
    </Modal>
  );
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
  const [folderOpen, setFolderOpen] = useState(false);
  const notify = useNotify();
  const [folderBusy, setFolderBusy] = useState(false);
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
    if ("q" in changes) setSearchValue(String(changes.q || ""));
    router.push(hrefWithParams({ page: null, ...changes }, filters));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchValue.trim() || null });
  }

  return (
    <div className={`stack ${styles.page}`}>
      <header className="page-header">
        <h1>Media</h1>
        <div className={styles.pageActions}>
          <Button variant="secondary" onClick={() => setFolderOpen(true)}>New folder</Button>
          <Button onClick={() => setUploadOpen(true)} type="button"><Upload aria-hidden="true" size={16} /> Upload</Button>
        </div>
      </header>

      <Modal open={folderOpen} onClose={() => { if (!folderBusy) setFolderOpen(false); }} title="New folder" className={styles.folderModal}>
      <form className={styles.newFolder} onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setFolderBusy(true);
        try {
          const result = await createMediaFolder(data);
          if (result.error) notify(result.error, "danger");
          else { notify("Folder created."); setFolderOpen(false); navigate({ scope: "all", folder: result.name!, q: null, tag: null, kind: null }); }
        } catch { notify("The folder could not be created. Please try again.", "danger"); }
        finally { setFolderBusy(false); }
      }}>
        <label>Folder name<input autoFocus name="name" required maxLength={200} placeholder="e.g. Events" disabled={folderBusy} /></label>
        <div className="module-modal-actions">
          <Button variant="secondary" disabled={folderBusy} onClick={() => setFolderOpen(false)}>Cancel</Button>
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
              <p>{resultCount} {resultCount === 1 ? "file" : "files"}{filters.q ? ` matching “${filters.q}”` : ""}</p>
            </div>
            <div className={styles.viewToggle} aria-label="Asset view">
              <button aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} type="button"><Grid2X2 size={16} /></button>
              <button aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} type="button"><LayoutList size={16} /></button>
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
                  <option value="all">All files ({activeCount})</option>
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

          </div>

          {filters.q || filterCount ? (
            <div className={styles.activeFilters}>
              <span>Filtered by</span>
              {filters.scope !== "all" ? <button onClick={() => navigate({ scope: "all" })} type="button">{({home: "All files", recent: "Recently added", private: "Private", "needs-alt": "Needs alt text", "built-in": "Built-in", archived: "Archived"})[filters.scope]}<X size={12} /></button> : null}
              {filters.q ? <button onClick={() => navigate({ q: null })} type="button">Search: {filters.q}<X size={12} /></button> : null}
              {filters.folder ? <button onClick={() => navigate({ folder: null })} type="button">Folder: {filters.folder}<X size={12} /></button> : null}
              {filters.tag ? <button onClick={() => navigate({ tag: null })} type="button">Tag: {filters.tag}<X size={12} /></button> : null}
              {filters.kind !== "all" ? <button onClick={() => navigate({ kind: null })} type="button">Type: {filters.kind}<X size={12} /></button> : null}
              <button className={styles.clearFilters} onClick={() => navigate({ scope: "all", folder: null, kind: null, q: null, tag: null })} type="button">Clear all</button>
            </div>
          ) : null}

          <section aria-label="Asset results" className={styles.resultArea}>
            {assets.length ? (
              <div className={view === "grid" ? styles.assetGrid : styles.assetList}>
                {assets.map((asset, index) => (
                  <AssetCard asset={asset} index={index + (filters.page - 1) * 24} key={asset.id} onSelect={() => setSelectedId(asset.id)} selected={asset.id === selectedId} view={view} />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span><FolderOpen aria-hidden="true" size={25} /></span>
                <h3>{filters.q || filters.tag || filters.kind !== "all" ? "No assets match this view" : filters.folder ? "This folder is empty" : filters.scope === "archived" ? "Your archive is empty" : filters.scope === "all" ? "No files yet" : "No files in this category"}</h3>
                <p>{filters.q || filters.tag || filters.kind !== "all" ? "Try another search or clear your filters." : filters.folder ? "Upload images here, or assign existing files to this folder in their details." : filters.scope === "archived" ? "Assets you archive will stay recoverable here." : filters.scope === "all" ? "Upload images to use across your website and business." : "Choose another category to browse your files."}</p>
                {filters.q || filters.tag || filters.kind !== "all" ? (
                  <Button onClick={() => navigate({ scope: "all", folder: null, kind: null, q: null, tag: null })} size="sm" type="button" variant="secondary">Clear filters</Button>
                ) : filters.scope === "all" ? (
                  <Button onClick={() => setUploadOpen(true)} size="sm" type="button"><Upload size={15} /> Upload images</Button>
                ) : null}
              </div>
            )}
          </section>

          {pageCount > 1 ? (
            <nav aria-label="Asset pages" className={styles.pagination}>
              <Button disabled={filters.page <= 1} onClick={() => router.push(hrefWithParams({ page: Math.max(1, filters.page - 1) }, filters))} size="sm" type="button" variant="ghost"><ChevronLeft size={15} /> Previous</Button>
              <span>Page {filters.page} of {pageCount}</span>
              <Button disabled={filters.page >= pageCount} onClick={() => router.push(hrefWithParams({ page: Math.min(pageCount, filters.page + 1) }, filters))} size="sm" type="button" variant="ghost">Next <ChevronRight size={15} /></Button>
            </nav>
          ) : null}
        </section>

        {selectedAsset ? <AssetInspector folders={folders} archived={filters.scope === "archived"} asset={selectedAsset} key={selectedAsset?.id || filters.scope} onClose={() => setSelectedId(null)} /> : null}
      </div>

      <UploadAssetsModal folders={folders.map(folder => folder.name)} defaultFolder={filters.folder} canUpload={canUpload} onClose={() => setUploadOpen(false)} open={uploadOpen} />
    </div>
  );
}
