"use client";

import { FileText, ImagePlus, UploadCloud } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { cx } from "./utils";

type UploadFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  description?: string;
  disabledMessage?: string;
  initialFile?: File | null;
  label?: string;
  variant?: "image" | "document" | "data";
};

export function UploadField({
  accept,
  description,
  disabled,
  disabledMessage = "Uploads are temporarily unavailable. Please try again later.",
  id,
  initialFile,
  label = "Choose a file",
  multiple,
  onChange,
  variant = "image",
  ...props
}: UploadFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const Icon = variant === "image" ? ImagePlus : variant === "data" ? FileText : UploadCloud;
  const guidance = description || (variant === "image" ? "JPG, PNG, WebP, GIF, or SVG · up to 12 MB" : "Drop a file here or browse your device");

  useEffect(() => {
    if (!initialFile || !inputRef.current) return;

    const transfer = new DataTransfer();
    transfer.items.add(initialFile);
    inputRef.current.files = transfer.files;
    setFileName(initialFile.name);
  }, [initialFile]);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || !event.dataTransfer.files.length || !inputRef.current) return;
    const transfer = new DataTransfer();
    for (const file of Array.from(event.dataTransfer.files).slice(0, multiple ? undefined : 1)) transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(transfer.files.length > 1 ? `${transfer.files.length} files selected` : transfer.files[0]?.name || "");
    inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div className="ui-upload-field">
      <input
        {...props}
        accept={accept}
        className="ui-sr-only"
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        onChange={(event) => {
          const files = event.currentTarget.files;
          setFileName(files && files.length > 1 ? `${files.length} files selected` : files?.[0]?.name || "");
          onChange?.(event);
        }}
        ref={inputRef}
        type="file"
      />
      <label
        className={cx("ui-upload-target", dragging && "is-dragging", disabled && "is-disabled")}
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="ui-upload-icon"><Icon size={22} aria-hidden="true" /></span>
        <span className="ui-upload-copy">
          <strong>{fileName || label}</strong>
          <span>{disabled ? disabledMessage : guidance}</span>
        </span>
        <span className="ui-upload-action">Browse</span>
      </label>
    </div>
  );
}
