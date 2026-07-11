"use client";

import NextImage from "next/image";
import { useId, useState, type ReactNode } from "react";
import { Images, Upload } from "lucide-react";
import { Button } from "./button";
import { Modal } from "./modal";
import { Tab, Tabs } from "./tabs";
import { cx } from "./utils";
import { UploadField } from "./upload-field";

export type AssetPickerAsset = {
  alt: string;
  filename: string;
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
  defaultAlt: string;
  emptyLibraryMessage?: string;
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

export function AssetPicker({
  assets,
  attachFields,
  attachFormId,
  canUpload,
  children,
  defaultAlt,
  emptyLibraryMessage = "No reusable assets yet.",
  title,
  triggerClassName,
  triggerHint,
  uploadFields,
  uploadFormId,
  uploadUnavailableMessage = "Uploads need Server asset folder, R2, or Cloudflare Images."
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<"upload" | "library">(canUpload || !assets.length ? "upload" : "library");
  const [fileName, setFileName] = useState("");
  const fileInputId = useId();

  return (
    <>
      <button className={cx("asset-picker-trigger", triggerClassName)} onClick={() => setOpen(true)} type="button">
        {children}
        <span className="asset-picker-trigger-hint">{triggerHint}</span>
      </button>

      <Modal bodyClassName="asset-picker-body" className="asset-picker-modal" onClose={() => setOpen(false)} open={open} title={title}>
        <Tabs className="asset-picker-tabs">
          <Tab aria-selected={activeMode === "upload"} className={activeMode === "upload" ? "is-active" : ""} onClick={() => setActiveMode("upload")}>
            <Upload size={15} />
            Upload
          </Tab>
          <Tab aria-selected={activeMode === "library"} className={activeMode === "library" ? "is-active" : ""} onClick={() => setActiveMode("library")}>
            <Images size={15} />
            Library
          </Tab>
        </Tabs>

        {activeMode === "upload" ? (
          <div className="asset-picker-panel">
            <HiddenFields fields={uploadFields} formId={uploadFormId} />
            <input form={uploadFormId} name="alt" type="hidden" value={defaultAlt} />
            <UploadField
              accept="image/*"
              description="JPG, PNG, WebP, GIF, or SVG · saved to your reusable asset library"
              disabled={!canUpload}
              form={uploadFormId}
              id={fileInputId}
              label="Choose an image or drop it here"
              name="file"
              onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name || "")}
              required
            />
            {!canUpload ? <p className="muted-text ui-zero">{uploadUnavailableMessage}</p> : null}
            <Button disabled={!canUpload} form={uploadFormId} type="submit">
              <Upload size={16} />
              {fileName ? `Upload ${fileName}` : "Upload to asset library"}
            </Button>
          </div>
        ) : (
          <div className="asset-picker-panel">
            <HiddenFields fields={attachFields} formId={attachFormId} />
            <input form={attachFormId} name="alt" type="hidden" value={defaultAlt} />
            <div className="asset-picker-grid">
              {assets.map((asset) => (
                <button className="asset-picker-option" form={attachFormId} key={asset.id} name="mediaAssetId" type="submit" value={asset.id}>
                  <NextImage alt={asset.alt} height={140} src={asset.thumbnailUrl} unoptimized width={180} />
                  <span>{asset.filename}</span>
                </button>
              ))}
              {!assets.length ? (
                <div className="asset-picker-empty">
                  <Images size={24} />
                  <span>{emptyLibraryMessage}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
