"use client";

import { useState, type DragEvent } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { UploadAssetsModal } from "@/modules/media/upload-assets-modal";

type QuickUploadClientProps = {
  canUpload: boolean;
  preview?: boolean;
};

export function QuickUploadClient({ canUpload, preview = false }: QuickUploadClientProps) {
  const [dragging, setDragging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  function openUpload(files: File[] = []) {
    setStagedFiles(files);
    setModalOpen(true);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (preview) return;
    openUpload(Array.from(event.dataTransfer.files));
  }

  return (
    <>
      <button
        className={`dashboard-quick-upload${dragging ? " is-dragging" : ""}`}
        disabled={preview}
        onClick={() => openUpload()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!preview) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        type="button"
      >
        <span className="dashboard-quick-upload-icon" aria-hidden="true">
          {dragging ? <ImagePlus size={24} /> : <UploadCloud size={24} />}
        </span>
        <span className="dashboard-quick-upload-copy">
          <strong>{dragging ? "Drop to continue" : "Upload media"}</strong>
          <small>{canUpload ? "Choose images or drag them here" : "Uploads are temporarily unavailable"}</small>
        </span>
        <span className="dashboard-quick-upload-action">Choose images</span>
      </button>

      {!preview && modalOpen ? (
        <UploadAssetsModal
          canUpload={canUpload}
          initialFiles={stagedFiles}
          onClose={() => {
            setModalOpen(false);
            setStagedFiles([]);
          }}
          open={modalOpen}
        />
      ) : null}
    </>
  );
}
