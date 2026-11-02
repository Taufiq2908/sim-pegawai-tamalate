"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Field, SubmitButton } from "@/components/form";
import { ErrorBox, Skeleton } from "@/components/ui";
import type { ArchiveCandidate } from "@/lib/types";

const SOURCE_OPTIONS: Array<{ value: "INCOMING" | "OUTGOING"; label: string }> = [
  { value: "INCOMING", label: "Surat Masuk" },
  { value: "OUTGOING", label: "Surat Keluar" },
];

const CATEGORY_OPTIONS: Array<{ value: "AKTIF" | "INAKTIF" | "PENTING"; label: string }> = [
  { value: "AKTIF", label: "Aktif" },
  { value: "INAKTIF", label: "Tidak Aktif" },
  { value: "PENTING", label: "Penting" },
];

export default function ArsipBaruPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [sourceType, setSourceType] = useState<"INCOMING" | "OUTGOING">("INCOMING");
  const [candidates, setCandidates] = useState<ArchiveCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    classificationCode: "",
    code: "",
    bundleCode: "",
    category: "AKTIF" as const,
    archiveDate: "",
    retentionUntil: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const params = new URLSearchParams({ sourceType });
      const { data } = await apiFetch<ArchiveCandidate[]>(
        `/archives/candidates?${params.toString()}`,
      );
      setCandidates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat kandidat surat");
    } finally {
      setCandidatesLoading(false);
    }
  }, [sourceType]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedId) {
      setError("Pilih surat yang akan dicatat ke buku arsip.");
      return;
    }
    if (!form.code.trim()) {
      setError("Kode arsip wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiFetch<{ id: string }>("/archives", {
        method: "POST",
        body: JSON.stringify({
          sourceType,
          sourceId: selectedId,
          classificationCode: form.classificationCode || undefined,
          code: form.code.trim(),
          bundleCode: form.bundleCode.trim() || undefined,
          category: form.category,
          archiveDate: form.archiveDate || undefined,
          retentionUntil: form.retentionUntil || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      router.replace(`/arsip/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat arsip");
    } finally {
      setLoading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const categoryLabel = (c: string): string => {
    switch (c) {
      case "AKTIF": return "Aktif";
      case "INAKTIF": return "Tidak Aktif";
      case "PENTING": return "Penting";
      default: return c;
    }
  };

  return (
    <RequirePerm perm="archive.create" label="Catat Arsip">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Catat Arsip</h1>
          <p className="mt-0.5 text-sm text-muted">
            Pilih surat yang sudah selesai ditangani, lalu catat ke buku arsip.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Sumber surat*">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as "INCOMING" | "OUTGOING")}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kategori*">
            <select value={form.category} onChange={set("category")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Lokasi simpan ditentukan otomatis: Aktif → Lemari Arsip, Tidak Aktif → Gudang Arsip, Penting → Lurah.
            </p>
          </Field>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-ink">Pilih surat sumber</p>
          {candidatesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted">Tidak ada kandidat surat untuk sumber dan filter ini.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`rounded-lg border px-3 py-3 text-sm transition ${
                    selectedId === c.id
                      ? "bg-brand-900 border-brand-900 text-white"
                      : "border-line bg-surface text-ink hover:bg-paper"
                  }`}
                >
                  <div className="font-medium">{c.subject}</div>
                  <div className="text-xs text-muted">
                    {c.agendaNumber ? `Agenda ${c.agendaNumber} • ` : ""}{c.letterNumber}
                  </div>
                  <div className="text-xs text-muted">{c.party}</div>
                  <div className="text-xs text-muted">{c.date}</div>
                  <div className="text-xs text-muted">{c.classification?.code ?? "-"} — {c.classification?.name ?? "-"}</div>
                </button>
              ))}
            </div>
          )}
          {selectedId ? (
            <p className="mt-2 text-xs text-ok-700">Terpilih: {candidates.find((c) => c.id === selectedId)?.subject}</p>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode klasifikasi arsip">
              <select value={form.classificationCode} onChange={set("classificationCode")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700">
                <option value="">— gunakan default dari surat —</option>
              </select>
            </Field>
            <Field label="Kode arsip*">
              <input required value={form.code} onChange={set("code")} placeholder="cth: 800.1.2" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Kode berkas">
              <input value={form.bundleCode} onChange={set("bundleCode")} placeholder="cth: B-2026-01" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Tanggal arsip">
              <input type="date" value={form.archiveDate} onChange={set("archiveDate")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
            <Field label="Retensi sampai">
              <input type="date" value={form.retentionUntil} onChange={set("retentionUntil")} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
            </Field>
          </div>
          <Field label="Catatan">
            <textarea value={form.notes} onChange={set("notes")} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700" />
          </Field>
          {error ? <ErrorBox message={error} /> : null}
          <SubmitButton loading={loading}>
            Simpan Arsip
          </SubmitButton>
        </form>
      </div>
    </RequirePerm>
  );
}
