"use client";

import { useState, type DragEvent } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { UploadAssetsModal } from "@/modules/media/upload-assets-modal";

type QuickUploadClientProps = {
  canUpload: boolean;
  mediaDriver: string;
  preview?: boolean;
};

export function QuickUploadClient({ canUpload, mediaDriver, preview = false }: QuickUploadClientProps) {
  const [dragging, setDragging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  function openUpload(file: File | null = null) {
    setStagedFile(file);
    setModalOpen(true);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (preview) return;
    openUpload(event.dataTransfer.files[0] || null);
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
          <small>{canUpload ? "Choose an image or drag it here" : "Open upload details and review storage"}</small>
        </span>
        <span className="dashboard-quick-upload-action">Choose file</span>
      </button>

      {!preview && modalOpen ? (
        <UploadAssetsModal
          canUpload={canUpload}
          initialFile={stagedFile}
          mediaDriver={mediaDriver}
          onClose={() => {
            setModalOpen(false);
            setStagedFile(null);
          }}
          open={modalOpen}
        />
      ) : null}
    </>
  );
}
