"use client";
import { useId, useRef, useState, type DragEvent } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import css from "./workspace.module.css";
import { RequiredMark } from "../components/required-mark";
export function AttachmentPicker({
  disabled = false,
  required = false,
  onChange,
}: {
  disabled?: boolean;
  required?: boolean;
  onChange?: () => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState("");
  function changed() {
    input.current?.setCustomValidity("");
    setFile(input.current?.files?.[0] ?? null);
    setError("");
    onChange?.();
  }
  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length !== 1) {
      setError("Choose one supporting file at a time.");
      input.current?.setCustomValidity("Choose one supporting file at a time.");
      return;
    }
    if (input.current) {
      const transfer = new DataTransfer();
      transfer.items.add(e.dataTransfer.files[0]);
      input.current.files = transfer.files;
      changed();
    }
  }
  return (
    <div
      className={css.filePicker}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      data-dragging={dragging}
    >
      <label htmlFor={id} className={css.fileDrop}>
        <span className={css.fileGlyph}>
          {file ? <FileText size={22} /> : <UploadCloud size={23} />}
        </span>
        <span>
          <strong>
            {file
              ? file.name
              : required
                ? "Choose a supporting file"
                : "Add a supporting file"}
            {required && <RequiredMark />}
          </strong>
          <span className={css.fileHint}>
            {file
              ? `${file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} · Click to replace`
              : "Choose a file or drag it here"}
          </span>
        </span>
        <input
          id={id}
          ref={input}
          className={css.fileInput}
          type="file"
          name="file"
          required={required}
          disabled={disabled}
          accept="application/pdf,image/png,image/jpeg"
          onChange={changed}
          aria-describedby={`${id}-help`}
        />
      </label>
      {file && (
        <button
          type="button"
          className={css.removeFile}
          aria-label="Remove selected file"
          disabled={disabled}
          onClick={() => {
            if (input.current) input.current.value = "";
            changed();
          }}
        >
          <X size={16} />
        </button>
      )}
      <p id={`${id}-help`} className={css.fileHelp}>
        PDF, PNG or JPEG · Up to 5 MB
        {!required && " · More can be attached to a later update"}
      </p>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </div>
  );
}
