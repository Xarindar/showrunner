"use client";

import { FileText, ImagePlus, UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { cx } from "./utils";

type UploadFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  description?: string;
  label?: string;
  variant?: "image" | "document" | "data";
};

export function UploadField({
  accept,
  description,
  disabled,
  id,
  label = "Choose a file",
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

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || !event.dataTransfer.files.length || !inputRef.current) return;
    inputRef.current.files = event.dataTransfer.files;
    setFileName(event.dataTransfer.files[0]?.name || "");
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
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name || "");
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
          <span>{disabled ? "Uploads are not available with the current storage settings." : guidance}</span>
        </span>
        <span className="ui-upload-action">Browse</span>
      </label>
    </div>
  );
}
