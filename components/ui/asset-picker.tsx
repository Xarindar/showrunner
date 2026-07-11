"use client";

import NextImage from "next/image";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ImageIcon, Images, Search, Sparkles, Upload, X } from "lucide-react";
import { Button } from "./button";
import { Modal } from "./modal";
import { cx } from "./utils";
import { UploadField } from "./upload-field";
import styles from "./asset-picker.module.css";

export type AssetPickerAsset = {
  alt: string;
  filename: string;
  folder?: string;
  id: string;
  thumbnailUrl: string;
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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [libraryAssets, setLibraryAssets] = useState(assets);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState(assets.length);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const requestIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputId = useId();
  const searchInputId = useId();

  const visibleAssets = useMemo(() => {
    const search = normalizedSearchValue(query);
    if (!search) return libraryAssets;
    return libraryAssets.filter((asset) =>
      [asset.filename, asset.alt, asset.folder || ""].some((value) => normalizedSearchValue(value).includes(search))
    );
  }, [libraryAssets, query]);

  const selectedAsset = libraryAssets.find((asset) => asset.id === selectedId) || null;

  async function loadLibrary(search: string, page: number, append = false) {
    if (!loadFromServer) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingLibrary(true);
    setLibraryError(false);

    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/media/assets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Asset library unavailable");
      const payload = (await response.json()) as { assets?: AssetPickerAsset[]; page?: number; total?: number };
      if (requestId !== requestIdRef.current || !Array.isArray(payload.assets)) return;

      setLibraryAssets((current) => {
        const selected = selectedId ? current.find((asset) => asset.id === selectedId) : null;
        const combined = append ? [...current, ...payload.assets!] : [...payload.assets!, ...(selected ? [selected] : [])];
        return Array.from(new Map(combined.map((asset) => [asset.id, asset])).values());
      });
      setLibraryPage(typeof payload.page === "number" ? payload.page : page);
      setLibraryTotal(typeof payload.total === "number" ? payload.total : payload.assets.length);
    } catch {
      if (requestId === requestIdRef.current) setLibraryError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoadingLibrary(false);
    }
  }

  function updateQuery(value: string) {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void loadLibrary(value, 1), 260);
  }

  function clearQuery() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setQuery("");
    void loadLibrary("", 1);
  }

  function openPicker() {
    setMode(assets.length || !canUpload ? "library" : "upload");
    setOpen(true);
    void loadLibrary("", 1);
  }

  function closePicker() {
    setOpen(false);
    setFileName("");
    setQuery("");
    setSelectedId(null);
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
                <span className={styles.kicker}>Your asset library</span>
                <p>{libraryTotal ? `${libraryTotal} reusable ${libraryTotal === 1 ? "asset" : "assets"}` : "Choose once, reuse anywhere"}</p>
              </div>
              <Button disabled={!canUpload} onClick={() => setMode("upload")} size="sm" type="button" variant="secondary">
                <Upload aria-hidden="true" size={15} />
                Upload new
              </Button>
            </div>

            <div className={styles.browser}>
              <section aria-label="Asset results" className={styles.results}>
                <div className={styles.searchField}>
                  <Search aria-hidden="true" size={17} />
                  <label className="ui-sr-only" htmlFor={searchInputId}>Search assets</label>
                  <input
                    autoComplete="off"
                    id={searchInputId}
                    onChange={(event) => updateQuery(event.currentTarget.value)}
                    placeholder="Search filename, alt text, or folder…"
                    type="search"
                    value={query}
                  />
                  {query ? (
                    <button aria-label="Clear asset search" onClick={clearQuery} type="button">
                      <X aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>

                <div className={styles.resultMeta} role="status">
                  <span>{loadingLibrary ? "Searching full library…" : `${libraryTotal} ${libraryTotal === 1 ? "result" : "results"}`}</span>
                  <span>{libraryError ? "Showing recent assets" : "Newest first"}</span>
                </div>

                {visibleAssets.length ? (
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
                            <small>{asset.folder || asset.alt || "Ready to use"}</small>
                          </span>
                        </button>
                      );
                    })}
                    {libraryAssets.length < libraryTotal ? (
                      <div className={styles.loadMore}>
                        <Button disabled={loadingLibrary} onClick={() => void loadLibrary(query, libraryPage + 1, true)} size="sm" type="button" variant="secondary">
                          {loadingLibrary ? "Loading…" : "Load more assets"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}><ImageIcon aria-hidden="true" size={24} /></span>
                    <strong>{query ? "No assets match your search" : emptyLibraryMessage}</strong>
                    <p>{query ? "Try a filename, alt text, or folder name." : "Upload an image now and it will be available everywhere you choose assets."}</p>
                    {query ? (
                      <Button onClick={clearQuery} size="sm" type="button" variant="secondary">Clear search</Button>
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
              <p aria-live="polite">{selectedAsset ? `${selectedAsset.filename} selected` : "Select one asset to continue"}</p>
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
