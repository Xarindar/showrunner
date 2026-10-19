"use client";

import NextImage from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ImageIcon, Images, Search, Upload, X } from "lucide-react";
import { summarizeMediaTags, type MediaTagSummary } from "@/lib/media-tags";
import { Button } from "./button";
import { Modal } from "./modal";
import { cx } from "./utils";
import { AssetUploadPanel, type AssetUploadAction } from "./asset-upload-panel";
import styles from "./asset-picker.module.css";

export type AssetPickerAsset = {
  alt: string;
  createdAt?: string;
  filename: string;
  folder?: string;
  id: string;
  source?: "global" | "library";
  tags?: string[];
  thumbnailUrl: string;
  url?: string;
};

type LibraryFilter = "all" | "recent";

type AssetLibraryResponse = {
  assets?: AssetPickerAsset[];
  page?: number;
  pageCount?: number;
  tagSummaries?: MediaTagSummary[];
  folders?: string[];
  total?: number;
};

type AssetPickerFieldMap = Record<string, string>;

type AssetPickerCommonProps = {
  assets: AssetPickerAsset[];
  canUpload: boolean;
  uploadAction?: AssetUploadAction;
  children: ReactNode;
  confirmLabel?: string;
  emptyLibraryMessage?: string;
  loadFromServer?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: string;
  triggerClassName?: string;
  triggerHint?: string;
  uploadUnavailableMessage?: string;
};

type AssetPickerProps = AssetPickerCommonProps & (
  | {
      attachFields?: never;
      attachFormId?: never;
      defaultAlt?: string;
      onSelectAsset: (asset: AssetPickerAsset) => void;
      onUploadRequest?: () => void;
      uploadFields?: never;
      uploadFormId?: never;
    }
  | {
      attachFields?: AssetPickerFieldMap;
      attachFormId: string;
      defaultAlt: string;
      onSelectAsset?: never;
      onUploadRequest?: never;
      uploadFields?: AssetPickerFieldMap;
      uploadFormId: string;
    }
);

function HiddenFields({ fields, formId }: { fields?: AssetPickerFieldMap; formId?: string }) {
  if (!formId) return null;
  return (
    <>
      {Object.entries(fields || {}).map(([name, value]) => (
        <input form={formId} key={name} name={name} type="hidden" value={value} />
      ))}
    </>
  );
}

function mergeTagSummaries(primary: MediaTagSummary[], supplemental: MediaTagSummary[]) {
  const merged = new Map(primary.map((tag) => [tag.name.toLocaleLowerCase(), { ...tag }]));
  supplemental.forEach((tag) => {
    const key = tag.name.toLocaleLowerCase();
    const current = merged.get(key);
    merged.set(key, { count: (current?.count || 0) + tag.count, name: current?.name || tag.name });
  });
  return [...merged.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function normalizedSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function assetWasAddedRecently(asset: AssetPickerAsset) {
  if (!asset.createdAt) return true;
  const createdAt = new Date(asset.createdAt).getTime();
  return Number.isFinite(createdAt) && createdAt >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

export function AssetPicker({
  assets,
  attachFields,
  attachFormId,
  canUpload,
  uploadAction,
  children,
  confirmLabel = "Use image",
  defaultAlt = "",
  emptyLibraryMessage = "No reusable assets yet.",
  loadFromServer = true,
  onOpenChange,
  onSelectAsset,
  onUploadRequest,
  open: controlledOpen,
  title,
  triggerClassName,
  triggerHint = "",
  uploadFormId,
  uploadUnavailableMessage = "Uploads are temporarily unavailable. Please try again later."
}: AssetPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [folder, setFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState(assets);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageCount, setLibraryPageCount] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState(assets.length);
  const initialTagSummaries = useMemo(() => summarizeMediaTags(assets), [assets]);
  const supplementalAssets = useMemo(
    () => (onSelectAsset ? assets.filter((asset) => asset.source === "global") : []),
    [assets, onSelectAsset]
  );
  const supplementalTagSummaries = useMemo(() => summarizeMediaTags(supplementalAssets), [supplementalAssets]);
  const [tagSummaries, setTagSummaries] = useState<MediaTagSummary[]>(initialTagSummaries);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const requestIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputId = useId();

  const visibleAssets = useMemo(() => {
    const search = normalizedSearchValue(query);
    return libraryAssets.filter((asset) => {
      if (folder && asset.folder !== folder) return false;
      if (!loadFromServer && libraryFilter === "recent" && !assetWasAddedRecently(asset)) return false;
      if (selectedTag && !(asset.tags || []).includes(selectedTag)) return false;
      if (!search) return true;
      return [asset.filename, asset.alt, asset.folder || "", ...(asset.tags || [])]
        .some((value) => normalizedSearchValue(value).includes(search));
    });
  }, [libraryAssets, libraryFilter, loadFromServer, query, selectedTag, folder]);

  const selectedAsset = libraryAssets.find((asset) => asset.id === selectedId) || null;
  const visibleTotal = loadFromServer ? libraryTotal : visibleAssets.length;
  const open = controlledOpen ?? internalOpen;

  function setPickerOpen(nextOpen: boolean) {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function matchingSupplementalAssets(filter: LibraryFilter, tag: string | null, search: string, selectedFolder = folder) {
    if (filter === "recent") return [];
    const normalizedSearch = normalizedSearchValue(search);
    return supplementalAssets.filter((asset) => {
      if (selectedFolder && asset.folder !== selectedFolder) return false;
      if (tag && !(asset.tags || []).includes(tag)) return false;
      if (!normalizedSearch) return true;
      return [asset.filename, asset.alt, asset.folder || "", ...(asset.tags || [])]
        .some((value) => normalizedSearchValue(value).includes(normalizedSearch));
    });
  }

  useEffect(() => () => {
    requestIdRef.current += 1;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  async function loadLibrary(
    search: string,
    page: number,
    append = false,
    filter: LibraryFilter = libraryFilter,
    tag: string | null = selectedTag,
    selectedFolder = folder
  ) {
    if (!loadFromServer) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingLibrary(true);
    setLibraryError(false);

    try {
      const params = new URLSearchParams({ page: String(page), scope: filter === "recent" ? "recent" : "all" });
      if (selectedFolder) params.set("folder", selectedFolder);
      if (search.trim()) params.set("q", search.trim());
      if (tag) params.set("tag", tag);
      const response = await fetch(`/api/media/assets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Asset library unavailable");
      const payload = (await response.json()) as AssetLibraryResponse;
      if (requestId !== requestIdRef.current || !Array.isArray(payload.assets)) return;
      const supplemental = matchingSupplementalAssets(filter, tag, search, selectedFolder);

      setLibraryAssets((current) => {
        const combined = append ? [...current, ...payload.assets!, ...supplemental] : [...payload.assets!, ...supplemental];
        return Array.from(new Map(combined.map((asset) => [asset.id, asset])).values());
      });
      if (Array.isArray(payload.folders)) setFolders([...new Set([...payload.folders, ...assets.map(asset => asset.folder).filter((name): name is string => Boolean(name))])].sort());
      setLibraryPage(typeof payload.page === "number" ? payload.page : page);
      setLibraryPageCount(typeof payload.pageCount === "number" ? payload.pageCount : 1);
      setLibraryTotal((typeof payload.total === "number" ? payload.total : payload.assets.length) + supplemental.length);
      if (Array.isArray(payload.tagSummaries)) {
        setTagSummaries(mergeTagSummaries(payload.tagSummaries, supplementalTagSummaries));
      }
    } catch {
      if (requestId === requestIdRef.current) setLibraryError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoadingLibrary(false);
    }
  }

  function updateQuery(value: string) {
    setQuery(value);
    setSelectedId(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(
      () => void loadLibrary(value, 1, false, libraryFilter, selectedTag),
      260
    );
  }

  function clearQuery() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setQuery("");
    setSelectedId(null);
    void loadLibrary("", 1, false, libraryFilter, selectedTag);
  }

  function changeLibraryFilter(filter: LibraryFilter) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const nextQuery = query;
    setLibraryFilter(filter);
    setSelectedId(null);
    setQuery(nextQuery);
    void loadLibrary(nextQuery, 1, false, filter, selectedTag);
  }

  function chooseTag(tag: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSelectedTag(tag || null); setSelectedId(null);
    void loadLibrary(query, 1, false, libraryFilter, tag || null);
  }

  function openPicker() {
    setMode("library");
    setLibraryFilter("all");
    setSelectedTag(null);
    setSelectedId(null);
    setQuery("");
    setFolder(""); setDroppedFiles([]);
    setFolders([...new Set(assets.map(asset => asset.folder).filter((name): name is string => Boolean(name)))].sort());
    const initialAssets = loadFromServer ? matchingSupplementalAssets("all", null, "", "") : assets;
    setLibraryAssets(initialAssets);
    setLibraryPage(1);
    setLibraryPageCount(1);
    setLibraryTotal(initialAssets.length);
    setTagSummaries(initialTagSummaries);
    setPickerOpen(true);
    void loadLibrary("", 1, false, "all", null, "");
  }

  function closePicker() {
    if (uploading) return;
    setPickerOpen(false);
    setQuery("");
    setSelectedId(null);
    setSelectedTag(null);
    setLibraryFilter("all");
    requestIdRef.current += 1;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }

  function startUpload() {
    if (!canUpload) return;
    if (onUploadRequest && !uploadAction) {
      closePicker();
      onUploadRequest();
      return;
    }
    if (uploadFormId || uploadAction) setMode("upload");
  }

  function confirmSelection() {
    if (!selectedAsset || !onSelectAsset) return;
    const asset = selectedAsset;
    closePicker();
    onSelectAsset(asset);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerHint || title}
        className={cx(styles.trigger, triggerClassName)}
        onClick={openPicker}
        type="button">
        {children}
        {triggerHint ? (
          <span className={cx("asset-picker-trigger-hint", styles.triggerHint)}>
            <Images aria-hidden="true" size={14} />
            {triggerHint}
          </span>
        ) : null}
      </button>

      <Modal bodyClassName={styles.body} className={styles.modal} onClose={closePicker} open={open} title={title}>
        {mode === "library" ? (
          <div className={styles.libraryView} onDragOver={event => { if (canUpload && (uploadAction || uploadFormId) && event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => {
            if (!canUpload || !(uploadAction || uploadFormId) || !event.dataTransfer.files.length) return;
            event.preventDefault(); setDroppedFiles(Array.from(event.dataTransfer.files)); setMode("upload");
          }}>
            <div className={styles.browser}>
              <section aria-label="Asset results" className={styles.results}>
                <div className={styles.toolbar}>
                <div className={styles.searchField}>
                  <Search aria-hidden="true" size={17} />
                  <label className="ui-sr-only" htmlFor={searchInputId}>
                    Search assets
                  </label>
                  <input
                    autoComplete="off"
                    id={searchInputId}
                    onChange={(event) => updateQuery(event.currentTarget.value)}
                    placeholder="Search images, folders, or tags…"
                    type="search"
                    value={query}
                  />
                  {query ? (
                    <button aria-label="Clear asset search" onClick={clearQuery} type="button">
                      <X aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>

                  <Button disabled={!canUpload || (!onUploadRequest && !uploadFormId && !uploadAction)} onClick={startUpload} type="button" variant="secondary"><Upload aria-hidden="true" size={15} /> Upload images</Button>
                </div>
                <div className={styles.filters}>
                  <label><span className="ui-sr-only">Library view</span><select aria-label="Library view" value={libraryFilter} onChange={event => changeLibraryFilter(event.currentTarget.value as LibraryFilter)}><option value="all">All images</option><option value="recent">Recently added</option></select></label>
                  <label><span className="ui-sr-only">Folder</span><select aria-label="Folder" value={folder} onChange={event => {
                    const next = event.currentTarget.value;
                    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                    setFolder(next); setSelectedId(null);
                    void loadLibrary(query, 1, false, libraryFilter, selectedTag, next);
                  }}><option value="">All folders</option>{folders.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
                  <label><span className="ui-sr-only">Tag</span><select aria-label="Tag" value={selectedTag || ""} onChange={event => chooseTag(event.currentTarget.value)}><option value="">All tags</option>{tagSummaries.map(tag => <option key={tag.name} value={tag.name}>{tag.name} ({tag.count})</option>)}</select></label>
                </div>
                <div className={styles.resultMeta} role="status">
                  <span>
                    {loadingLibrary
                      ? "Refreshing library…"
                        : `${visibleTotal} ${visibleTotal === 1 ? "result" : "results"}`}
                  </span>
                  <span>
                    {libraryError
                      ? "Couldn’t refresh — showing saved results"
                        : libraryFilter === "recent"
                          ? "Added in the last 30 days"
                          : selectedTag
                            ? `Tagged ${selectedTag}`
                            : "Newest first"}
                  </span>
                </div>

                {loadingLibrary && !visibleAssets.length ? (<div className={styles.empty} role="status">Loading images…</div>) : visibleAssets.length ? (
                  <div aria-label="Available assets" className={styles.grid}>
                    {visibleAssets.map((asset) => {
                      const selected = asset.id === selectedId;
                      return (
                        <button
                          aria-label={`Select ${asset.filename}`}
                          aria-pressed={selected}
                          className={cx(styles.option, selected && styles.optionSelected)}
                          key={asset.id}
                          onClick={() => setSelectedId(asset.id)}
                          type="button">
                          <span className={styles.thumbnail}>
                            <NextImage alt="" height={180} src={asset.thumbnailUrl} unoptimized width={240} />
                            <span aria-hidden="true" className={styles.selectionMark}>
                              <Check size={14} strokeWidth={3} />
                            </span>
                          </span>
                          <span className={styles.optionCopy}>
                            <strong title={asset.filename}>{asset.filename}</strong>
                            <small>{asset.folder || (asset.tags?.[0] ? `#${asset.tags[0]}` : asset.alt || "Ready to use")}</small>
                          </span>
                        </button>
                      );
                    })}
                    {libraryPage < libraryPageCount ? (
                      <div className={styles.loadMore}>
                        <Button
                          disabled={loadingLibrary}
                          onClick={() => void loadLibrary(query, libraryPage + 1, true, libraryFilter, selectedTag)}
                          size="sm"
                          type="button"
                          variant="secondary">
                          {loadingLibrary ? "Loading…" : "Load more assets"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}><ImageIcon aria-hidden="true" size={24} /></span>
                    <strong>
                      {query
                        ? "No assets match your search"
                        : selectedTag
                          ? `No images are tagged ${selectedTag}`
                          : libraryFilter === "recent"
                            ? "No images added recently"
                            : emptyLibraryMessage}
                    </strong>
                    <p>
                      {query
                        ? "Try an image name, folder, or tag."
                        : selectedTag
                          ? "Choose another tag or add this tag to an image in Media."
                          : libraryFilter === "recent"
                            ? "Switch to All to browse the full library."
                            : canUpload
                              ? "Upload an image now and it will be available everywhere you choose assets."
                              : uploadUnavailableMessage}
                    </p>
                    {query ? (
                      <Button onClick={clearQuery} size="sm" type="button" variant="secondary">Clear search</Button>
                    ) : selectedTag ? (
                      <Button onClick={() => chooseTag("")} size="sm" type="button" variant="secondary">Clear tag filter</Button>
                    ) : libraryFilter === "recent" ? (
                      <Button onClick={() => changeLibraryFilter("all")} size="sm" type="button" variant="secondary">View all assets</Button>
                    ) : canUpload ? (
                      <Button onClick={startUpload} size="sm" type="button">
                        <Upload aria-hidden="true" size={15} />
                        Upload an asset
                      </Button>
                    ) : null}
                  </div>
                )}
              </section>


            </div>

            <footer className={styles.footer}>
              <p aria-live="polite">
                {selectedAsset
                  ? `${selectedAsset.filename} selected`
                  : "Select an image"}
              </p>
              <div className="module-modal-actions">
                <Button onClick={closePicker} size="sm" type="button" variant="secondary">Cancel</Button>
                {onSelectAsset ? (
                  <Button disabled={!selectedAsset} onClick={confirmSelection} size="sm" type="button">
                    <Check aria-hidden="true" size={15} />
                    {confirmLabel}
                  </Button>
                ) : (
                  <>
                    <HiddenFields fields={attachFields} formId={attachFormId} />
                    {attachFormId ? <input form={attachFormId} name="alt" type="hidden" value={defaultAlt} /> : null}
                    <Button disabled={!selectedAsset || !attachFormId} form={attachFormId} name="mediaAssetId" size="sm" type="submit" value={selectedAsset?.id || ""}>
                      <Check aria-hidden="true" size={15} />
                      {confirmLabel}
                    </Button>
                  </>
                )}
              </div>
            </footer>
          </div>
        ) : (
          <AssetUploadPanel initialFiles={droppedFiles} defaultFolder={folder} folders={folders} canUpload={canUpload} defaultAlt={defaultAlt} uploadAction={uploadAction} onBusyChange={setUploading} onDone={uploaded => {
            setMode("library"); setLibraryFilter("all"); setFolder(""); setDroppedFiles([]); setQuery(""); setSelectedTag(null);
            if (uploaded.length) { setLibraryAssets(current => [...uploaded, ...current]); setSelectedId(uploaded[0].id); }
            void loadLibrary("", 1, false, "all", null, "");
          }} />
        )}
      </Modal>
    </>
  );
}
