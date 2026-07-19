"use client";

import { useId, useState } from "react";
import { ImageIcon, Upload } from "lucide-react";
import { Button, Modal, UploadField } from "@/components/ui";
import { uploadMediaAction } from "./actions";
import styles from "./media-library.module.css";

type UploadAssetsModalProps = {
  canUpload: boolean;
  initialFile?: File | null;
  mediaDriver: string;
  onClose: () => void;
  open: boolean;
};

function bytesLabel(bytes: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function driverLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

export function UploadAssetsModal({ canUpload, initialFile = null, mediaDriver, onClose, open }: UploadAssetsModalProps) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(initialFile);
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
              initialFile={initialFile}
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
