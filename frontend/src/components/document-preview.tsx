"use client";

import { useEffect, useState } from "react";
import { fileUrl } from "@/lib/file-url";
import type { LetterDocument } from "@/lib/types";

type PreviewKind = "pdf" | "image" | "other";

function kindOf(doc: Pick<LetterDocument, "mimeType" | "originalName">): PreviewKind {
  const mime = (doc.mimeType || "").toLowerCase();
  const name = (doc.originalName || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(jpe?g|png)$/i.test(name)) return "image";
  return "other";
}

/** Pratinjau dokumen memakai blob agar endpoint attachment tetap bisa dirender. */
export function DocumentPreview({ document }: { document: LetterDocument }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const kind = kindOf(document);

  useEffect(() => {
    if (!open || kind === "other") return;
    let alive = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError("");
    setUrl(null);

    fetch(fileUrl(document.downloadUrl), { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Dokumen tidak dapat dimuat.");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!alive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Pratinjau gagal dimuat.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, document.downloadUrl, kind]);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{document.originalName}</span>
        <span className="text-xs text-muted">
          {(document.sizeBytes / 1024).toFixed(1)} KB
        </span>
        {kind !== "other" ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md border border-line bg-field px-2.5 py-1 text-xs font-semibold text-brand-900 hover:bg-paper"
          >
            {open ? "Tutup pratinjau" : "Pratinjau"}
          </button>
        ) : null}
        <a
          href={fileUrl(document.downloadUrl)}
          className="rounded-md border border-line bg-field px-2.5 py-1 text-xs font-medium text-brand-900 hover:bg-paper"
        >
          Unduh
        </a>
      </div>

      {open && kind !== "other" ? (
        <div className="border-t border-line p-3">
          {loading ? (
            <div className="flex h-48 items-center justify-center rounded-md bg-paper text-sm text-muted">
              Memuat pratinjau…
            </div>
          ) : error ? (
            <div className="rounded-md bg-bad-100/60 px-3 py-2 text-sm text-bad-700">{error}</div>
          ) : url ? (
            kind === "pdf" ? (
              <iframe
                src={url}
                title={`Pratinjau ${document.originalName}`}
                className="h-[520px] w-full rounded-md border border-line bg-white"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={document.originalName}
                className="mx-auto max-h-[520px] rounded-md border border-line bg-white object-contain"
              />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
