"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { AssetUploadPanel } from "@/components/ui/asset-upload-panel";
import styles from "@/components/ui/asset-upload-panel.module.css";

type UploadAssetsModalProps = {
  canUpload: boolean;
  defaultFolder?: string;
  folders?: string[];
  initialFile?: File | null;
  initialFiles?: File[];
  onClose: () => void;
  open: boolean;
};

export function UploadAssetsModal({ canUpload, defaultFolder, folders, initialFile, initialFiles, onClose, open }: UploadAssetsModalProps) {
  const [busy, setBusy] = useState(false);
  return <Modal bodyClassName={styles.body} className={styles.dialog} onClose={() => { if (!busy) onClose(); }} open={open} title={defaultFolder ? `Upload images to ${defaultFolder}` : "Upload images"}>
    <AssetUploadPanel defaultFolder={defaultFolder} folders={folders} canUpload={canUpload} initialFiles={initialFiles || (initialFile ? [initialFile] : [])} showMetadata onBusyChange={setBusy} onDone={() => onClose()} />
  </Modal>;
}
