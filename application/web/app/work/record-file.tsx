"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowDownToLine, Eye, FileText, X } from "lucide-react";
import { Modal } from "../components/ui/modal";
import type { Kind } from "./types";
import css from "./workspace.module.css";

export function RecordFile({
  kind,
  recordId,
  file,
}: {
  kind: Kind;
  recordId: string;
  file: {
    id: string;
    filename: string;
    mime?: "application/pdf" | "image/png" | "image/jpeg";
  };
}) {
  const [open, setOpen] = useState(false);
  const url = `/api/work/${kind}/${recordId}/attachments/${file.id}`;
  const mime = file.mime ?? "application/pdf";
  return (
    <>
      <div className={css.fileCard}>
        <span className={css.fileGlyph}>
          <FileText size={19} />
        </span>
        <span className={css.fileName}>
          <strong>{file.filename}</strong>
          <small>Secure supporting file</small>
        </span>
        <div className={css.fileActions}>
          <button
            type="button"
            aria-label={`View ${file.filename}`}
            onClick={() => setOpen(true)}
          >
            <Eye size={15} />
            <span>View</span>
          </button>
          <a
            href={url}
            download
            aria-label={`Download ${file.filename}`}
            title={`Download ${file.filename}`}
          >
            <ArrowDownToLine size={16} />
          </a>
        </div>
      </div>
      {open && (
        <Modal
          presentation="center"
          className={css.filePreviewDialog}
          aria-labelledby={`file-preview-${file.id}`}
          onClose={() => setOpen(false)}
        >
          <div className={css.filePreview}>
            <header className={css.filePreviewHeader}>
              <div>
                <h2 id={`file-preview-${file.id}`}>{file.filename}</h2>
                <small>Secure file preview</small>
              </div>
              <button
                type="button"
                aria-label="Close file preview"
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            <div className={css.filePreviewContent}>
              {mime === "application/pdf" ? (
                <iframe
                  title={`Preview of ${file.filename}`}
                  src={`${url}?view=1`}
                />
              ) : (
                <div className={css.filePreviewImage}>
                  <Image
                    src={`${url}?view=1`}
                    alt={file.filename}
                    fill
                    unoptimized
                    sizes="(max-width: 900px) 100vw, 900px"
                  />
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
