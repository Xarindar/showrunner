"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ArrowDownAZ,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  File,
  Folder,
  FolderOpen,
  Grid2X2,
  HardDrive,
  House,
  ImageIcon,
  Images,
  Info,
  LayoutList,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Button, ButtonLink, Modal, UploadField } from "@/components/ui";
import type { MediaTagSummary } from "@/lib/media-tags";
import {
  archiveMediaAssetAction,
  restoreMediaAssetAction,
  setHeroImageAction,
  updateMediaAssetAction,
  uploadMediaAction
} from "./actions";
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
  mediaDriver: string;
  needsAltCount: number;
  pageCount: number;
  privateCount: number;
  recentCount: number;
  resultCount: number;
  savedMessage: string;
  tags: MediaTagSummary[];
};

type ViewMode = "grid" | "list";

const scopeCopy: Record<MediaLibraryFilters["scope"], { eyebrow: string; title: string }> = {
  home: { eyebrow: "Library home", title: "Your media" },
  all: { eyebrow: "Library", title: "All assets" },
  recent: { eyebrow: "Saved view", title: "Recently added" },
  private: { eyebrow: "Saved view", title: "Private assets" },
  "needs-alt": { eyebrow: "Accessibility", title: "Needs alt text" },
  archived: { eyebrow: "Archive", title: "Archived assets" },
  "built-in": { eyebrow: "Global assets", title: "Built-in assets" }
};

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

function driverLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
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
  if (next.scope && next.scope !== "home") params.set("scope", next.scope);
  if (next.folder) params.set("folder", next.folder);
  if (next.tag) params.set("tag", next.tag);
  if (next.kind && next.kind !== "all") params.set("kind", next.kind);
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));

  const query = params.toString();
  return `/admin/modules/media${query ? `?${query}` : ""}`;
}

function ScopeButton({
  active,
  count,
  icon,
  label,
  onClick
}: {
  active: boolean;
  count: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-current={active ? "page" : undefined} className={active ? styles.navItemActive : styles.navItem} onClick={onClick} type="button">
      <span>{icon}{label}</span>
      <small>{count}</small>
    </button>
  );
}

function AssetStatus({ asset }: { asset: MediaLibraryAsset }) {
  if (asset.builtIn) return <span className={styles.statusBuiltIn}><Sparkles aria-hidden="true" size={12} /> Global</span>;
  if (asset.isPrivate) return <span className={styles.statusPrivate}><Lock aria-hidden="true" size={12} /> Private</span>;
  if (asset.isDecorative) return <span className={styles.statusNeutral}>Decorative</span>;
  if (!asset.alt) return <span className={styles.statusWarning}>Needs alt</span>;
  return <span className={styles.statusReady}><ShieldCheck aria-hidden="true" size={12} /> Ready</span>;
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
      <span className={styles.assetIndex}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.assetCopy}>
        <strong title={asset.filename}>{asset.filename}</strong>
        <small>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.format || "Asset"} · {bytesLabel(asset.sizeBytes)}</small>
      </span>
      <span className={styles.assetMeta}>
        <AssetStatus asset={asset} />
        {asset.usageCount ? <small>{asset.usageCount} {asset.usageCount === 1 ? "use" : "uses"}</small> : <small>Unused</small>}
      </span>
      <span aria-hidden="true" className={styles.selectedMark}><Check size={14} strokeWidth={3} /></span>
    </button>
  );
}

function MetadataForm({ asset, onArchive }: { asset: MediaLibraryAsset; onArchive: () => void }) {
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
          <input defaultValue={asset.folder} name="folder" placeholder="e.g. Products / Summer" />
        </label>
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
            <small>Require signed access instead of a public URL.</small>
          </span>
          <input defaultChecked={asset.isPrivate} name="isPrivate" type="checkbox" />
        </label>
      </div>

      <div className={styles.inspectorActions}>
        <Button size="sm" type="submit">Save changes</Button>
        <Button onClick={onArchive} size="sm" type="button" variant="ghost">
          <Archive aria-hidden="true" size={14} /> Archive
        </Button>
      </div>
    </form>
  );
}

function AssetInspector({ asset, archived, onClose }: { asset: MediaLibraryAsset | null; archived: boolean; onClose: () => void }) {
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!asset) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.inspectorBlank}>
          <span><Info aria-hidden="true" size={21} /></span>
          <strong>Select an asset</strong>
          <p>Preview the original, review accessibility, and edit metadata without leaving the library.</p>
        </div>
      </aside>
    );
  }

  const totalUsageCount = asset.usageCount + (asset.isHero ? 1 : 0) + (asset.isLogo ? 1 : 0);

  return (
    <>
      <button aria-label="Close asset details" className={styles.inspectorBackdrop} onClick={onClose} type="button" />
      <aside aria-label={`${asset.filename} details`} className={`${styles.inspector} ${styles.inspectorOpen}`}>
        <div className={styles.inspectorHead}>
          <div>
            <span>Asset details</span>
            <strong title={asset.filename}>{asset.filename}</strong>
          </div>
          <Button aria-label="Close asset details" onClick={onClose} size="sm" type="button" variant="ghost"><X size={16} /></Button>
        </div>

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
            <div><dt>Storage</dt><dd>{driverLabel(asset.driver)}</dd></div>
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
            <MetadataForm asset={asset} onArchive={() => setConfirmArchive(true)} />
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
              <div><Trash2 aria-hidden="true" size={18} /><span><strong>Archive this asset?</strong><small>It will disappear from active pickers. Existing uses may still reference it.</small></span></div>
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
      </aside>
    </>
  );
}

function UploadAssetsModal({ canUpload, mediaDriver, onClose, open }: { canUpload: boolean; mediaDriver: string; onClose: () => void; open: boolean }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [decorative, setDecorative] = useState(false);

  function closeUpload() {
    setFile(null);
    setDecorative(false);
    onClose();
  }

  return (
    <Modal bodyClassName={styles.uploadModalBody} className={styles.uploadModal} onClose={closeUpload} open={open} title="Upload an asset">
      <form action={uploadMediaAction} className={styles.uploadForm}>
        <div className={styles.uploadIntro}>
          <span className={styles.uploadIntroIcon}><Upload aria-hidden="true" size={20} /></span>
          <div><strong>Add to your reusable library</strong><p>Upload once, then choose this asset from products, services, content, galleries, and brand settings.</p></div>
        </div>

        <div className={styles.uploadStage}>
          <div className={styles.uploadDropzone}>
            <UploadField
              accept="image/*"
              description="JPG, PNG, WebP, GIF, or SVG · up to 8 MB"
              disabled={!canUpload}
              id={inputId}
              label="Drop an image here, or choose a file"
              name="file"
              onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
              required
            />
            {!canUpload ? <p className={styles.uploadError}>Uploads are unavailable while storage is set to {driverLabel(mediaDriver)}.</p> : null}
          </div>

          <div className={styles.uploadPreview}>
            {file ? (
              <>
                <div className={styles.uploadFileIcon}><ImageIcon aria-hidden="true" size={28} /></div>
                <strong title={file.name}>{file.name}</strong>
                <small>{bytesLabel(file.size)} · Ready to upload</small>
              </>
            ) : (
              <div className={styles.uploadPreviewEmpty}><ImageIcon aria-hidden="true" size={24} /><span>Your preview will appear here</span></div>
            )}
          </div>
        </div>

        <div className={styles.uploadMetadata}>
          <input name="caption" type="hidden" value="" />
          <input name="credit" type="hidden" value="" />
          <input name="focalPointX" type="hidden" value="0.5" />
          <input name="focalPointY" type="hidden" value="0.5" />
          <input name="usageContext" type="hidden" value="" />
          <div className={styles.uploadMetadataHead}>
            <div><strong>Essential details</strong><p>Finish deeper metadata from the asset inspector after upload.</p></div>
            <span>Required</span>
          </div>
          <label className={styles.field}>
            <span>Alt text</span>
            <textarea name="alt" placeholder="Describe the image’s purpose for people who cannot see it" required={!decorative} rows={3} />
          </label>
          <div className={styles.uploadFieldGrid}>
            <label className={styles.field}><span>Folder</span><input name="folder" placeholder="e.g. Products / Summer" /></label>
            <label className={styles.field}><span>Tags</span><input name="tags" placeholder="portrait, homepage" /></label>
          </div>
          <div className={styles.uploadChecks}>
            <label className={styles.checkRow}><span><strong>Decorative</strong><small>Skip this image for screen readers.</small></span><input checked={decorative} name="isDecorative" onChange={(event) => setDecorative(event.currentTarget.checked)} type="checkbox" /></label>
            <label className={styles.checkRow}><span><strong>Private</strong><small>Require signed delivery.</small></span><input name="isPrivate" type="checkbox" /></label>
          </div>
        </div>

        <footer className={styles.uploadFooter}>
          <p aria-live="polite">{file ? `${file.name} is ready` : "Choose an image to continue"}</p>
          <div>
            <Button onClick={closeUpload} size="sm" type="button" variant="ghost">Cancel</Button>
            <Button disabled={!canUpload || !file} size="sm" type="submit"><Upload aria-hidden="true" size={15} /> Upload asset</Button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

function LibraryHome({
  activeCount,
  assets,
  builtInCount,
  canUpload,
  folders,
  needsAltCount,
  onNavigate,
  onOpenUpload,
  onSearch,
  onSearchValueChange,
  onSelect,
  searchValue,
  selectedId,
  tags
}: {
  activeCount: number;
  assets: MediaLibraryAsset[];
  builtInCount: number;
  canUpload: boolean;
  folders: FolderSummary[];
  needsAltCount: number;
  onNavigate: (changes: Record<string, string | number | null>) => void;
  onOpenUpload: () => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSearchValueChange: (value: string) => void;
  onSelect: (id: string) => void;
  searchValue: string;
  selectedId: string | null;
  tags: MediaTagSummary[];
}) {
  return (
    <div className={styles.home}>
      <section className={styles.homeHero}>
        <div className={styles.homeHeroCopy}>
          <span>Asset library</span>
          <h2>Find the right image without digging.</h2>
          <p>Search everything, return to recent work, or jump directly into a tag or folder.</p>
        </div>
        <form className={styles.homeSearch} onSubmit={onSearch} role="search">
          <Search aria-hidden="true" size={20} />
          <label className="ui-sr-only" htmlFor="media-home-search">Search your asset library</label>
          <input
            id="media-home-search"
            onChange={(event) => onSearchValueChange(event.currentTarget.value)}
            placeholder="Search filename, alt text, caption, or folder…"
            type="search"
            value={searchValue}
          />
          <button aria-label="Search asset library" type="submit"><ArrowRight aria-hidden="true" size={18} /></button>
        </form>
      </section>

      <section aria-label="Library actions" className={styles.homeActions}>
        {canUpload ? (
          <button className={styles.uploadLaunch} onClick={onOpenUpload} type="button">
            <span className={styles.uploadLaunchIcon}><Upload aria-hidden="true" size={25} /></span>
            <span className={styles.uploadLaunchCopy}>
              <small>Add to the library</small>
              <strong>Drop in a new image</strong>
              <span>Upload once, add alt text and tags, then reuse it anywhere.</span>
            </span>
            <span className={styles.uploadLaunchAction}>Add asset <ArrowRight aria-hidden="true" size={16} /></span>
          </button>
        ) : (
          <Link className={styles.uploadLaunch} href="/admin/modules/settings">
            <span className={styles.uploadLaunchIcon}><HardDrive aria-hidden="true" size={25} /></span>
            <span className={styles.uploadLaunchCopy}>
              <small>Storage is read-only</small>
              <strong>Connect an upload destination</strong>
              <span>Choose a server folder, S3, R2, or Cloudflare Images in Settings.</span>
            </span>
            <span className={styles.uploadLaunchAction}>Open settings <ArrowRight aria-hidden="true" size={16} /></span>
          </Link>
        )}

        <div className={styles.quickViews}>
          <button onClick={() => onNavigate({ scope: "all" })} type="button">
            <span><Images aria-hidden="true" size={17} /> All assets</span>
            <strong>{activeCount}</strong>
          </button>
          <button onClick={() => onNavigate({ scope: "needs-alt" })} type="button">
            <span><ShieldCheck aria-hidden="true" size={17} /> Needs alt text</span>
            <strong>{needsAltCount}</strong>
          </button>
          <button onClick={() => onNavigate({ scope: "built-in" })} type="button">
            <span><Sparkles aria-hidden="true" size={17} /> Built-in</span>
            <strong>{builtInCount}</strong>
          </button>
        </div>
      </section>

      <section className={styles.homeSection}>
        <div className={styles.homeSectionHead}>
          <div><span>Pick up where you left off</span><h3>Recently added</h3></div>
          <button onClick={() => onNavigate({ scope: "recent" })} type="button">View recent <ArrowRight aria-hidden="true" size={14} /></button>
        </div>
        {assets.length ? (
          <div className={styles.homeRecentGrid}>
            {assets.map((asset, index) => (
              <AssetCard asset={asset} index={index} key={asset.id} onSelect={() => onSelect(asset.id)} selected={asset.id === selectedId} view="grid" />
            ))}
          </div>
        ) : (
          <div className={styles.homeRecentEmpty}>
            <span><Clock3 aria-hidden="true" size={21} /></span>
            <div><strong>No uploaded assets yet</strong><p>Your latest uploads will stay within easy reach here—never the entire library at once.</p></div>
          </div>
        )}
      </section>

      <div className={styles.homeCollections}>
        <section className={styles.collectionPanel}>
          <div className={styles.homeSectionHead}>
            <div><span>Flexible collections</span><h3>Browse by tag</h3></div>
            <Tags aria-hidden="true" size={18} />
          </div>
          {tags.length ? (
            <div className={styles.tagCloud}>
              {tags.map((tag) => (
                <button key={tag.name} onClick={() => onNavigate({ scope: "all", tag: tag.name })} type="button">
                  <span>#{tag.name}</span><small>{tag.count}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.collectionEmpty}><strong>Tags make the library faster.</strong><p>Add tags during upload or from an asset’s details. They become instant filters here and in every image chooser.</p></div>
          )}
        </section>

        <section className={styles.collectionPanel}>
          <div className={styles.homeSectionHead}>
            <div><span>Stable structure</span><h3>Browse folders</h3></div>
            <Folder aria-hidden="true" size={18} />
          </div>
          {folders.length ? (
            <div className={styles.folderCards}>
              {folders.slice(0, 8).map((folder) => (
                <button key={folder.name} onClick={() => onNavigate({ folder: folder.name, scope: "all" })} type="button">
                  <span><Folder aria-hidden="true" size={16} /> {folder.name}</span><small>{folder.count} {folder.count === 1 ? "asset" : "assets"}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.collectionEmpty}><strong>Folders are ready when you need them.</strong><p>Use folders for durable structure, and tags for flexible cross-library groupings.</p></div>
          )}
        </section>
      </div>
    </div>
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
  mediaDriver,
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
  const [view, setView] = useState<ViewMode>("grid");
  const selectedAsset = assets.find((asset) => asset.id === selectedId) || null;
  const currentScope = scopeCopy[filters.scope];
  const isHome = filters.scope === "home";

  const folderLabel = useMemo(() => folders.find((folder) => folder.name === filters.folder)?.name || filters.folder, [filters.folder, folders]);

  function navigate(changes: Record<string, string | number | null>) {
    setSelectedId(null);
    router.push(hrefWithParams({ page: null, ...changes }, filters));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchValue.trim() || null, scope: "all" });
  }

  return (
    <div className={`stack ${styles.page}`}>
      <header className="page-header">
        <div>
          <p className="eyebrow">Media</p>
          <h1>Media</h1>
          <p>A calm, searchable home for every reusable image and asset.</p>
        </div>
        {!isHome ? <div className={styles.pageActions}>
          {canUpload ? (
            <Button onClick={() => setUploadOpen(true)} type="button">
              <Upload aria-hidden="true" size={16} /> Add asset
            </Button>
          ) : (
            <ButtonLink href="/admin/modules/settings" variant="secondary">
              <HardDrive aria-hidden="true" size={16} /> Set up uploads
            </ButtonLink>
          )}
        </div> : null}
      </header>

      {savedMessage ? <div className={styles.feedbackSuccess} role="status"><Check aria-hidden="true" size={17} /> {savedMessage}</div> : null}
      {errorMessage ? <div className={styles.feedbackError} role="alert"><Info aria-hidden="true" size={17} /> {errorMessage}</div> : null}

      <div className={`${styles.workspace} ${isHome ? styles.workspaceHome : ""} ${isHome && selectedAsset ? styles.workspaceHomeInspector : ""}`}>
        <nav aria-label="Asset library views" className={styles.sidebar}>
          <div className={styles.libraryIdentity}>
            <span><Images aria-hidden="true" size={18} /></span>
            <div><strong>Asset library</strong><small>{activeCount} active assets</small></div>
          </div>

          <div className={styles.navGroup}>
            <span className={styles.navLabel}>Library</span>
            <ScopeButton active={isHome} count={activeCount} icon={<House aria-hidden="true" size={15} />} label="Library home" onClick={() => navigate({ folder: null, kind: null, q: null, scope: "home", sort: null, tag: null })} />
            <ScopeButton active={filters.scope === "all" && !filters.folder && !filters.tag} count={activeCount} icon={<Grid2X2 aria-hidden="true" size={15} />} label="All assets" onClick={() => navigate({ folder: null, scope: "all", tag: null })} />
            <ScopeButton active={filters.scope === "recent"} count={recentCount} icon={<Clock3 aria-hidden="true" size={15} />} label="Recently added" onClick={() => navigate({ folder: null, scope: "recent", tag: null })} />
            <ScopeButton active={filters.scope === "needs-alt"} count={needsAltCount} icon={<ShieldCheck aria-hidden="true" size={15} />} label="Needs alt text" onClick={() => navigate({ folder: null, scope: "needs-alt", tag: null })} />
            <ScopeButton active={filters.scope === "private"} count={privateCount} icon={<Lock aria-hidden="true" size={15} />} label="Private" onClick={() => navigate({ folder: null, scope: "private", tag: null })} />
          </div>

          {folders.length ? (
            <div className={styles.navGroup}>
              <span className={styles.navLabel}>Folders</span>
              {folders.map((folder) => (
                <button
                  aria-current={filters.folder === folder.name ? "page" : undefined}
                  className={filters.folder === folder.name ? styles.navItemActive : styles.navItem}
                  key={folder.name || "root"}
                  onClick={() => navigate({ folder: folder.name || null, scope: "all", tag: null })}
                  type="button">
                  <span><Folder aria-hidden="true" size={15} />{folder.name || "Unfiled"}</span><small>{folder.count}</small>
                </button>
              ))}
            </div>
          ) : null}

          {tags.length ? (
            <div className={styles.navGroup}>
              <span className={styles.navLabel}>Tags</span>
              {tags.slice(0, 6).map((tag) => (
                <button
                  aria-current={filters.tag === tag.name ? "page" : undefined}
                  className={filters.tag === tag.name ? styles.navItemActive : styles.navItem}
                  key={tag.name}
                  onClick={() => navigate({ folder: null, scope: "all", tag: tag.name })}
                  type="button">
                  <span><Tags aria-hidden="true" size={15} />{tag.name}</span><small>{tag.count}</small>
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.navGroup}>
            <span className={styles.navLabel}>System</span>
            <ScopeButton active={filters.scope === "built-in"} count={builtInCount} icon={<Sparkles aria-hidden="true" size={15} />} label="Built-in" onClick={() => navigate({ folder: null, scope: "built-in", tag: null })} />
            <ScopeButton active={filters.scope === "archived"} count={archivedCount} icon={<Archive aria-hidden="true" size={15} />} label="Archived" onClick={() => navigate({ folder: null, scope: "archived", tag: null })} />
          </div>

          <div className={styles.storageCard}>
            <HardDrive aria-hidden="true" size={16} />
            <div><span>Storage</span><strong>{driverLabel(mediaDriver)}</strong></div>
            <i className={canUpload ? styles.storageOnline : styles.storageOffline} />
          </div>
        </nav>

        <main className={styles.libraryMain}>
          {isHome ? (
            <LibraryHome
              activeCount={activeCount}
              assets={assets}
              builtInCount={builtInCount}
              canUpload={canUpload}
              folders={folders}
              needsAltCount={needsAltCount}
              onNavigate={navigate}
              onOpenUpload={() => setUploadOpen(true)}
              onSearch={submitSearch}
              onSearchValueChange={setSearchValue}
              onSelect={setSelectedId}
              searchValue={searchValue}
              selectedId={selectedId}
              tags={tags}
            />
          ) : (
          <>
          <div className={styles.libraryHeader}>
            <div>
              <span>{currentScope.eyebrow}</span>
              <h2>{folderLabel || (filters.tag ? `#${filters.tag}` : currentScope.title)}</h2>
              <p>{resultCount} {resultCount === 1 ? "asset" : "assets"}{filters.q ? ` matching “${filters.q}”` : ""}</p>
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
              <input id="media-library-search" onChange={(event) => setSearchValue(event.currentTarget.value)} placeholder="Search filename, alt text, caption, folder…" type="search" value={searchValue} />
              {searchValue ? <button aria-label="Clear search" onClick={() => { setSearchValue(""); navigate({ q: null }); }} type="button"><X size={15} /></button> : null}
            </form>

            <label className={styles.selectControl}>
              <span className="ui-sr-only">Asset type</span>
              <ImageIcon aria-hidden="true" size={15} />
              <select onChange={(event) => navigate({ kind: event.currentTarget.value })} value={filters.kind}>
                <option value="all">All types</option>
                <option value="image">Images</option>
                <option value="other">Other files</option>
              </select>
            </label>

            {tags.length ? (
              <label className={styles.selectControl}>
                <span className="ui-sr-only">Filter by tag</span>
                <Tags aria-hidden="true" size={15} />
                <select onChange={(event) => navigate({ tag: event.currentTarget.value || null })} value={filters.tag}>
                  <option value="">All tags</option>
                  {tags.map((tag) => <option key={tag.name} value={tag.name}>#{tag.name} ({tag.count})</option>)}
                </select>
              </label>
            ) : null}

            <label className={styles.selectControl}>
              <span className="ui-sr-only">Sort assets</span>
              <ArrowDownAZ aria-hidden="true" size={15} />
              <select onChange={(event) => navigate({ sort: event.currentTarget.value })} value={filters.sort}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Filename A–Z</option>
                <option value="largest">Largest first</option>
              </select>
            </label>

          </div>

          {filters.q || filters.folder || filters.tag || filters.kind !== "all" ? (
            <div className={styles.activeFilters}>
              <span>Filtered by</span>
              {filters.q ? <button onClick={() => navigate({ q: null })} type="button">Search: {filters.q}<X size={12} /></button> : null}
              {filters.folder ? <button onClick={() => navigate({ folder: null })} type="button">Folder: {filters.folder}<X size={12} /></button> : null}
              {filters.tag ? <button onClick={() => navigate({ tag: null })} type="button">Tag: {filters.tag}<X size={12} /></button> : null}
              {filters.kind !== "all" ? <button onClick={() => navigate({ kind: null })} type="button">Type: {filters.kind}<X size={12} /></button> : null}
              <button className={styles.clearFilters} onClick={() => navigate({ folder: null, kind: null, q: null, tag: null })} type="button">Clear all</button>
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
                <h3>{filters.q || filters.folder || filters.tag || filters.kind !== "all" ? "No assets match this view" : filters.scope === "archived" ? "Your archive is empty" : canUpload ? "Your library is ready" : "No uploaded assets yet"}</h3>
                <p>{filters.q || filters.folder || filters.tag || filters.kind !== "all" ? "Keep your filters visible and adjust them, or clear the view to see everything." : filters.scope === "archived" ? "Assets you archive will stay recoverable here." : canUpload ? "Upload the first asset and reuse it across every part of the product." : "Storage is currently read-only. Browse the built-in collection, or choose an upload-capable storage mode in Settings."}</p>
                {filters.q || filters.folder || filters.tag || filters.kind !== "all" ? (
                  <Button onClick={() => navigate({ folder: null, kind: null, q: null, tag: null })} size="sm" type="button" variant="secondary">Clear filters</Button>
                ) : filters.scope !== "archived" && canUpload ? (
                  <Button onClick={() => setUploadOpen(true)} size="sm" type="button"><Upload size={15} /> Upload an asset</Button>
                ) : filters.scope !== "archived" ? (
                  <Button onClick={() => navigate({ scope: "built-in" })} size="sm" type="button" variant="secondary"><Sparkles size={15} /> Browse built-in assets</Button>
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
          </>
          )}
        </main>

        {!isHome || selectedAsset ? <AssetInspector archived={filters.scope === "archived"} asset={selectedAsset} key={selectedAsset?.id || filters.scope} onClose={() => setSelectedId(null)} /> : null}
      </div>

      <UploadAssetsModal canUpload={canUpload} mediaDriver={mediaDriver} onClose={() => setUploadOpen(false)} open={uploadOpen} />
    </div>
  );
}
