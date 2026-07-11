"use client";

import NextImage from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Clock3, ImageIcon, Images, Search, Sparkles, Tag, Upload, X } from "lucide-react";
import { summarizeMediaTags, type MediaTagSummary } from "@/lib/media-tags";
import { Button } from "./button";
import { Modal } from "./modal";
import { cx } from "./utils";
import { UploadField } from "./upload-field";
import styles from "./asset-picker.module.css";

export type AssetPickerAsset = {
  alt: string;
  createdAt?: string;
  filename: string;
  folder?: string;
  id: string;
  tags?: string[];
  thumbnailUrl: string;
};

type LibraryFilter = "all" | "recent" | "tags";

type AssetLibraryResponse = {
  assets?: AssetPickerAsset[];
  page?: number;
  pageCount?: number;
  tagSummaries?: MediaTagSummary[];
  total?: number;
};

type AssetPickerFieldMap = Record<string, string>;

type AssetPickerProps = {
  assets: AssetPickerAsset[];
  attachFields?: AssetPickerFieldMap;
  attachFormId: string;
  canUpload: boolean;
  children: ReactNode;
  confirmLabel?: string;
  defaultAlt: string;
  emptyLibraryMessage?: string;
  loadFromServer?: boolean;
  title: string;
  triggerClassName?: string;
  triggerHint: string;
  uploadFields?: AssetPickerFieldMap;
  uploadFormId: string;
  uploadUnavailableMessage?: string;
};

function HiddenFields({ fields, formId }: { fields?: AssetPickerFieldMap; formId: string }) {
  return (
    <>
      {Object.entries(fields || {}).map(([name, value]) => (
        <input form={formId} key={name} name={name} type="hidden" value={value} />
      ))}
    </>
  );
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
  children,
  confirmLabel = "Use image",
  defaultAlt,
  emptyLibraryMessage = "No reusable assets yet.",
  loadFromServer = true,
  title,
  triggerClassName,
  triggerHint,
  uploadFields,
  uploadFormId,
  uploadUnavailableMessage = "Uploads need Server asset folder, S3, R2, or Cloudflare Images."
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("recent");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [libraryAssets, setLibraryAssets] = useState(assets);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageCount, setLibraryPageCount] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState(assets.length);
  const initialTagSummaries = useMemo(() => summarizeMediaTags(assets), [assets]);
  const [tagSummaries, setTagSummaries] = useState<MediaTagSummary[]>(initialTagSummaries);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const requestIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputId = useId();
  const searchInputId = useId();

  const visibleAssets = useMemo(() => {
    const search = normalizedSearchValue(query);
    return libraryAssets.filter((asset) => {
      if (!loadFromServer && libraryFilter === "recent" && !assetWasAddedRecently(asset)) return false;
      if (libraryFilter === "tags" && selectedTag && !(asset.tags || []).includes(selectedTag)) return false;
      if (!search) return true;
      return [asset.filename, asset.alt, asset.folder || "", ...(asset.tags || [])]
        .some((value) => normalizedSearchValue(value).includes(search));
    });
  }, [libraryAssets, libraryFilter, loadFromServer, query, selectedTag]);

  const visibleTagSummaries = useMemo(() => {
    if (selectedTag) return tagSummaries;
    const search = normalizedSearchValue(query);
    return search ? tagSummaries.filter((tag) => normalizedSearchValue(tag.name).includes(search)) : tagSummaries;
  }, [query, selectedTag, tagSummaries]);

  const selectedAsset = libraryAssets.find((asset) => asset.id === selectedId) || null;
  const browsingTags = libraryFilter === "tags" && !selectedTag;
  const visibleTotal = loadFromServer ? libraryTotal : visibleAssets.length;

  useEffect(() => () => {
    requestIdRef.current += 1;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  async function loadLibrary(
    search: string,
    page: number,
    append = false,
    filter: LibraryFilter = libraryFilter,
    tag: string | null = selectedTag
  ) {
    if (!loadFromServer) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingLibrary(true);
    setLibraryError(false);

    try {
      const params = new URLSearchParams({ page: String(page), scope: filter === "recent" ? "recent" : "all" });
      if (search.trim()) params.set("q", search.trim());
      if (filter === "tags" && tag) params.set("tag", tag);
      const response = await fetch(`/api/media/assets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Asset library unavailable");
      const payload = (await response.json()) as AssetLibraryResponse;
      if (requestId !== requestIdRef.current || !Array.isArray(payload.assets)) return;

      setLibraryAssets((current) => {
        const combined = append ? [...current, ...payload.assets!] : payload.assets!;
        return Array.from(new Map(combined.map((asset) => [asset.id, asset])).values());
      });
      setLibraryPage(typeof payload.page === "number" ? payload.page : page);
      setLibraryPageCount(typeof payload.pageCount === "number" ? payload.pageCount : 1);
      setLibraryTotal(typeof payload.total === "number" ? payload.total : payload.assets.length);
      if (Array.isArray(payload.tagSummaries)) setTagSummaries(payload.tagSummaries);
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
    if (browsingTags) return;
    searchTimerRef.current = setTimeout(
      () => void loadLibrary(value, 1, false, libraryFilter, selectedTag),
      260
    );
  }

  function clearQuery() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setQuery("");
    setSelectedId(null);
    if (!browsingTags) void loadLibrary("", 1, false, libraryFilter, selectedTag);
  }

  function changeLibraryFilter(filter: LibraryFilter) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const nextQuery = libraryFilter === "tags" ? "" : query;
    setLibraryFilter(filter);
    setSelectedId(null);
    setSelectedTag(null);
    setQuery(nextQuery);
    if (filter !== "tags") void loadLibrary(nextQuery, 1, false, filter, null);
  }

  function chooseTag(tag: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (tag === selectedTag) {
      setSelectedTag(null);
      setSelectedId(null);
      setQuery("");
      return;
    }
    setSelectedTag(tag);
    setSelectedId(null);
    setQuery("");
    void loadLibrary("", 1, false, "tags", tag);
  }

  function openPicker() {
    setMode("library");
    setLibraryFilter("recent");
    setSelectedTag(null);
    setSelectedId(null);
    setQuery("");
    setLibraryAssets(assets);
    setLibraryPage(1);
    setLibraryPageCount(1);
    setLibraryTotal(assets.length);
    setTagSummaries(initialTagSummaries);
    setOpen(true);
    void loadLibrary("", 1, false, "recent", null);
  }

  function closePicker() {
    setOpen(false);
    setFileName("");
    setQuery("");
    setSelectedId(null);
    setSelectedTag(null);
    setLibraryFilter("recent");
    requestIdRef.current += 1;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
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
          <div className={styles.libraryView}>
            <div className={styles.viewHeader}>
              <div>
                <span className={styles.kicker}>Choose from your library</span>
                <p>Find the right image without leaving your work.</p>
              </div>
              <Button className={styles.uploadAction} disabled={!canUpload} onClick={() => setMode("upload")} size="sm" type="button" variant="secondary">
                <Upload aria-hidden="true" size={15} />
                Add new image
              </Button>
            </div>

            <div className={styles.browser}>
              <section aria-label="Asset results" className={styles.results}>
                <nav aria-label="Filter asset library" className={styles.filterTabs}>
                  <button
                    aria-pressed={libraryFilter === "all"}
                    className={cx(styles.filterTab, libraryFilter === "all" && styles.filterTabActive)}
                    onClick={() => changeLibraryFilter("all")}
                    type="button">
                    <Images aria-hidden="true" size={16} />
                    All
                  </button>
                  <button
                    aria-pressed={libraryFilter === "recent"}
                    className={cx(styles.filterTab, libraryFilter === "recent" && styles.filterTabActive)}
                    onClick={() => changeLibraryFilter("recent")}
                    type="button">
                    <Clock3 aria-hidden="true" size={16} />
                    Recent
                  </button>
                  <button
                    aria-pressed={libraryFilter === "tags"}
                    className={cx(styles.filterTab, libraryFilter === "tags" && styles.filterTabActive)}
                    onClick={() => changeLibraryFilter("tags")}
                    type="button">
                    <Tag aria-hidden="true" size={16} />
                    Tags
                  </button>
                </nav>

                <div className={styles.searchField}>
                  <Search aria-hidden="true" size={17} />
                  <label className="ui-sr-only" htmlFor={searchInputId}>
                    {browsingTags ? "Find a tag" : "Search assets"}
                  </label>
                  <input
                    autoComplete="off"
                    id={searchInputId}
                    onChange={(event) => updateQuery(event.currentTarget.value)}
                    placeholder={
                      browsingTags
                        ? "Find a tag…"
                        : selectedTag
                          ? `Search within ${selectedTag}…`
                          : "Search filename, alt text, folder, or tag…"
                    }
                    type="search"
                    value={query}
                  />
                  {query ? (
                    <button aria-label="Clear asset search" onClick={clearQuery} type="button">
                      <X aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>

                {libraryFilter === "tags" ? (
                  <div className={styles.tagRail}>
                    <div className={styles.tagRailHeading}>
                      <span><Tag aria-hidden="true" size={14} /> Browse tags</span>
                      {selectedTag ? (
                        <button onClick={() => chooseTag(selectedTag)} type="button">View all tags</button>
                      ) : null}
                    </div>
                    {visibleTagSummaries.length ? (
                      <div aria-label="Asset tags" className={styles.tagChips}>
                        {visibleTagSummaries.map((tag) => (
                          <button
                            aria-pressed={selectedTag === tag.name}
                            className={cx(styles.tagChip, selectedTag === tag.name && styles.tagChipActive)}
                            key={tag.name}
                            onClick={() => chooseTag(tag.name)}
                            type="button">
                            <span>{tag.name}</span>
                            <small>{tag.count}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.resultMeta} role="status">
                  <span>
                    {loadingLibrary
                      ? "Refreshing library…"
                      : browsingTags
                        ? `${visibleTagSummaries.length} ${visibleTagSummaries.length === 1 ? "tag" : "tags"}`
                        : `${visibleTotal} ${visibleTotal === 1 ? "result" : "results"}`}
                  </span>
                  <span>
                    {libraryError
                      ? "Couldn’t refresh — showing saved results"
                      : browsingTags
                        ? "Choose one to narrow the library"
                        : libraryFilter === "recent"
                          ? "Added in the last 30 days"
                          : selectedTag
                            ? `Tagged ${selectedTag}`
                            : "Newest first"}
                  </span>
                </div>

                {browsingTags ? (
                  <div className={styles.tagLanding}>
                    <span className={styles.tagLandingIcon}><Tag aria-hidden="true" size={24} /></span>
                    <strong>
                      {tagSummaries.length
                        ? visibleTagSummaries.length
                          ? "Choose a tag to see matching images"
                          : "No tags match your search"
                        : "No tagged images yet"}
                    </strong>
                    <p>
                      {tagSummaries.length
                        ? visibleTagSummaries.length
                          ? "Tags keep a large library focused. Select one above to browse only the images you need."
                          : "Try a broader tag name or clear your search."
                        : "Add tags in Media to create fast, reusable collections here."}
                    </p>
                    {query && !visibleTagSummaries.length ? (
                      <Button onClick={clearQuery} size="sm" type="button" variant="secondary">Clear tag search</Button>
                    ) : null}
                  </div>
                ) : visibleAssets.length ? (
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
                        ? "Try a filename, alt text, folder, or tag."
                        : selectedTag
                          ? "Choose another tag or add this tag to an image in Media."
                          : libraryFilter === "recent"
                            ? "Switch to All to browse the full library."
                            : "Upload an image now and it will be available everywhere you choose assets."}
                    </p>
                    {query ? (
                      <Button onClick={clearQuery} size="sm" type="button" variant="secondary">Clear search</Button>
                    ) : selectedTag ? (
                      <Button onClick={() => chooseTag(selectedTag)} size="sm" type="button" variant="secondary">Browse all tags</Button>
                    ) : libraryFilter === "recent" ? (
                      <Button onClick={() => changeLibraryFilter("all")} size="sm" type="button" variant="secondary">View all assets</Button>
                    ) : canUpload ? (
                      <Button onClick={() => setMode("upload")} size="sm" type="button">
                        <Upload aria-hidden="true" size={15} />
                        Upload an asset
                      </Button>
                    ) : null}
                  </div>
                )}
              </section>

              <aside aria-label="Selected asset preview" className={styles.inspector}>
                {selectedAsset ? (
                  <>
                    <div className={styles.preview}>
                      <NextImage alt={selectedAsset.alt || selectedAsset.filename} height={420} src={selectedAsset.thumbnailUrl} unoptimized width={560} />
                    </div>
                    <div className={styles.inspectorCopy}>
                      <span className={styles.readyBadge}><Check aria-hidden="true" size={13} /> Selected</span>
                      <h3>{selectedAsset.filename}</h3>
                      <dl>
                        <div>
                          <dt>Alt text</dt>
                          <dd>{selectedAsset.alt || "Not provided"}</dd>
                        </div>
                        {selectedAsset.folder ? (
                          <div>
                            <dt>Folder</dt>
                            <dd>{selectedAsset.folder}</dd>
                          </div>
                        ) : null}
                        {selectedAsset.tags?.length ? (
                          <div>
                            <dt>Tags</dt>
                            <dd className={styles.previewTags}>
                              {selectedAsset.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </>
                ) : (
                  <div className={styles.inspectorEmpty}>
                    <span><Sparkles aria-hidden="true" size={22} /></span>
                    <strong>Select an asset to preview</strong>
                    <p>Nothing is applied until you confirm your choice.</p>
                  </div>
                )}
              </aside>
            </div>

            <footer className={styles.footer}>
              <p aria-live="polite">
                {selectedAsset
                  ? `${selectedAsset.filename} selected`
                  : browsingTags
                    ? "Choose a tag, then select one image"
                    : "Select one asset to continue"}
              </p>
              <div>
                <Button onClick={closePicker} size="sm" type="button" variant="ghost">Cancel</Button>
                <HiddenFields fields={attachFields} formId={attachFormId} />
                <input form={attachFormId} name="alt" type="hidden" value={defaultAlt} />
                <Button disabled={!selectedAsset} form={attachFormId} name="mediaAssetId" size="sm" type="submit" value={selectedAsset?.id || ""}>
                  <Check aria-hidden="true" size={15} />
                  {confirmLabel}
                </Button>
              </div>
            </footer>
          </div>
        ) : (
          <div className={styles.uploadView}>
            <div className={styles.viewHeader}>
              <div>
                <span className={styles.kicker}>Upload new</span>
                <p>Add it once, then reuse it throughout your site.</p>
              </div>
              <Button onClick={() => setMode("library")} size="sm" type="button" variant="ghost">
                <ArrowLeft aria-hidden="true" size={15} />
                Back to library
              </Button>
            </div>

            <div className={styles.uploadCanvas}>
              <HiddenFields fields={uploadFields} formId={uploadFormId} />
              <input form={uploadFormId} name="alt" type="hidden" value={defaultAlt} />
              <UploadField
                accept="image/*"
                description="JPG, PNG, WebP, GIF, or SVG · up to 8 MB"
                disabled={!canUpload}
                form={uploadFormId}
                id={fileInputId}
                label="Drop an image here, or choose a file"
                name="file"
                onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name || "")}
                required
              />

              <div className={styles.uploadPromise}>
                <span><Images aria-hidden="true" size={18} /></span>
                <div>
                  <strong>Saved to your library</strong>
                  <p>The uploaded image will be attached here now and remain available for future pages.</p>
                </div>
              </div>

              {!canUpload ? <p className={styles.unavailable} role="status">{uploadUnavailableMessage}</p> : null}
            </div>

            <footer className={styles.footer}>
              <p aria-live="polite">{fileName ? `${fileName} is ready to upload` : "Choose one image to continue"}</p>
              <div>
                <Button onClick={closePicker} size="sm" type="button" variant="ghost">Cancel</Button>
                <Button disabled={!canUpload || !fileName} form={uploadFormId} size="sm" type="submit">
                  <Upload aria-hidden="true" size={15} />
                  Upload asset
                </Button>
              </div>
            </footer>
          </div>
        )}
      </Modal>
    </>
  );
}
