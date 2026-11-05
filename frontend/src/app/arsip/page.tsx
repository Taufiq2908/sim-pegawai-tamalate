"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type {
  ArchiveCategory,
  ArchiveRecord,
  ArchiveSourceType,
} from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

interface ArchiveQueueRow {
  id: string;
  // Kontrak kanonik antrean arsip.
  agendaNumber?: string | null;
  letterNumber: string;
  subject: string;
  sender?: string | null;
  recipient?: string | null;
  receivedDate?: string;
  completedAt?: string | null;
  letterDate?: string;
  issuedAt?: string | null;
  status: string;
  classification?: { code: string; name?: string } | null;
  archiveRecord: null;
}

interface BatchResult {
  kind: "approve" | "reject";
  approved: Array<{ id: string; archiveNumber: string }>;
  rejected: Array<{ id: string; note: string }>;
  skipped: Array<{ id: string; reason: string }>;
  labels: Record<string, string>;
}

const SOURCE_OPTIONS: Array<{ value: ArchiveSourceType; label: string }> = [
  { value: "INCOMING", label: "Surat Masuk" },
  { value: "OUTGOING", label: "Surat Keluar" },
];
const CATEGORY_OPTIONS: Array<{ value: ArchiveCategory; label: string }> = [
  { value: "AKTIF", label: "Aktif" },
  { value: "INAKTIF", label: "Tidak Aktif" },
  { value: "PENTING", label: "Penting" },
];
const BATCH_MAX = 15;

export default function ArsipPage() {
  const { user, hasPermission } = useAuth();
  // Permission archive.approve/reject juga dimiliki jabatan LEADER lain,
  // tetapi endpoint antrean/persetujuan hanya untuk Sekcam/Camat/SUPER_ADMIN.
  const archiveApprover =
    user?.role === "SUPER_ADMIN" || ["SEKCAM", "CAMAT"].includes(user?.position ?? "");
  const canApprove = hasPermission("archive.approve") && archiveApprover;
  const canReject = hasPermission("archive.reject") && archiveApprover;
  const canUpdate = hasPermission("archive.update");
  const canEditMetadata = user?.role === "SUPER_ADMIN";

  const [items, setItems] = useState<ArchiveRecord[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sourceType, setSourceType] = useState<ArchiveSourceType | "">("");
  const [category, setCategory] = useState<ArchiveCategory | "">("");
  const [classificationCode, setClassificationCode] = useState("");
  const [year, setYear] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [listId, setListId] = useState("");
  const [unlisted, setUnlisted] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [queueType, setQueueType] = useState<"incoming" | "outgoing">("incoming");
  const [queueRows, setQueueRows] = useState<ArchiveQueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectNote, setRejectNote] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sourceType) params.set("sourceType", sourceType);
      if (category) params.set("category", category);
      if (classificationCode.trim()) params.set("classificationCode", classificationCode.trim());
      if (year) params.set("year", year);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (listId.trim()) params.set("listId", listId.trim());
      if (unlisted) params.set("unlisted", "true");
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("limit", "20");

      const { data, meta: m } = await apiFetch<ArchiveRecord[]>(`/archives?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as { page: number; limit: number; total: number } | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku arsip");
    } finally {
      setLoading(false);
    }
  }, [sourceType, category, classificationCode, year, dateFrom, dateTo, listId, unlisted, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadQueue = useCallback(async () => {
    if (!canApprove) return;
    setQueueLoading(true);
    setQueueError("");
    try {
      const path =
        queueType === "incoming"
          ? "/letters/archive-queue?limit=50"
          : "/outgoing-letters/archive-queue?limit=50";
      const { data } = await apiFetch<ArchiveQueueRow[]>(path);
      setQueueRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      setQueueRows([]);
      setQueueError(err instanceof Error ? err.message : "Gagal memuat antrean arsip");
    } finally {
      setQueueLoading(false);
    }
  }, [canApprove, queueType]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") !== "antrean") return;
    const timer = window.setTimeout(() => {
      document.getElementById("antrean-arsip")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  const locationLabel = (loc: ArchiveRecord["location"]): string => {
    switch (loc) {
      case "LEMARI_ARSIP": return "Lemari Arsip";
      case "GUDANG_ARSIP": return "Gudang Arsip";
      case "LURAH": return "Lurah";
      default: return loc;
    }
  };

  const sourceLabel = (s: ArchiveRecord["sourceType"]): string =>
    s === "INCOMING" ? "Masuk" : "Keluar";

  const queueNumber = (row: ArchiveQueueRow): string =>
    queueType === "incoming" ? row.agendaNumber ?? row.letterNumber : row.letterNumber;
  const queueParty = (row: ArchiveQueueRow): string =>
    queueType === "incoming" ? row.sender ?? "—" : row.recipient ?? "—";
  const queueDate = (row: ArchiveQueueRow): string => {
    const value = queueType === "incoming" ? row.completedAt : row.issuedAt ?? row.letterDate;
    return value ? value.slice(0, 10) : "—";
  };
  const queueClassification = (row: ArchiveQueueRow): string => row.classification?.code ?? "—";

  const pageCount = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 20)));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= BATCH_MAX) {
          toast.error(`Maksimal ${BATCH_MAX} surat per batch.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === queueRows.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(queueRows.slice(0, BATCH_MAX).map((row) => row.id)));
    if (queueRows.length > BATCH_MAX) toast.info(`Hanya ${BATCH_MAX} surat pertama yang dipilih.`);
  }

  async function submitBatch(kind: "approve" | "reject") {
    if (selected.size === 0) {
      toast.error("Pilih minimal satu surat.");
      return;
    }
    if (kind === "reject" && rejectNote.trim().length < 3) {
      toast.error("Catatan revisi minimal 3 karakter.");
      return;
    }

    const labels = Object.fromEntries(
      queueRows.filter((row) => selected.has(row.id)).map((row) => [row.id, `${queueNumber(row)} — ${row.subject}`]),
    );
    const ids = Array.from(selected);
    const base =
      queueType === "incoming" ? "/letters/archive-approvals" : "/outgoing-letters/archive-approvals";

    setSubmitting(kind);
    try {
      if (kind === "approve") {
        const { data } = await apiFetch<{ approved: Array<{ id: string; archiveNumber: string }>; skipped: Array<{ id: string; reason: string }> }>(
          `${base}/batch`,
          { method: "POST", body: JSON.stringify({ ids }) },
        );
        setBatchResult({
          kind,
          approved: data.approved ?? [],
          rejected: [],
          skipped: data.skipped ?? [],
          labels,
        });
        toast.success(
          data.skipped?.length
            ? `${data.approved?.length ?? 0} disetujui, ${data.skipped.length} dilewati.`
            : `${data.approved?.length ?? 0} surat diarsipkan.`,
        );
      } else {
        const { data } = await apiFetch<{ rejected: Array<{ id: string; note: string }>; skipped: Array<{ id: string; reason: string }> }>(
          `${base}/reject`,
          { method: "POST", body: JSON.stringify({ ids, note: rejectNote.trim() }) },
        );
        setBatchResult({
          kind,
          approved: [],
          rejected: data.rejected ?? [],
          skipped: data.skipped ?? [],
          labels,
        });
        setRejectNote("");
        toast.success(
          data.skipped?.length
            ? `${data.rejected?.length ?? 0} dikembalikan, ${data.skipped.length} dilewati.`
            : `${data.rejected?.length ?? 0} surat dikembalikan untuk revisi.`,
        );
      }
      refreshNotificationBadge();
      setSelected(new Set());
      await loadQueue();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch arsip gagal");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <RequirePerm perm="archive.view" label="Buku Arsip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Arsip</h1>
          <p className="mt-0.5 text-sm text-muted">
            Arsip dibuat otomatis dari persetujuan surat masuk dan surat keluar. Tidak ada pencatatan arsip manual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/arsip/daftar" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-paper">
            Daftar Arsip
          </Link>
          {canUpdate ? (
            <Link href="/arsip/daftar/baru" className="rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800">
              + Susun daftar
            </Link>
          ) : null}
        </div>
      </div>

      {canApprove ? (
        <section id="antrean-arsip" className="mt-4 rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div>
              <h2 className="font-semibold">Antrean Persetujuan Arsip</h2>
              <p className="text-xs text-muted">Pilih maksimal {BATCH_MAX} surat, lalu setujui atau kembalikan untuk revisi.</p>
            </div>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => setQueueType("incoming")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${queueType === "incoming" ? "bg-brand-900 text-white" : "border border-line bg-field text-muted hover:bg-paper"}`}
              >
                Surat Masuk
              </button>
              <button
                type="button"
                onClick={() => setQueueType("outgoing")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${queueType === "outgoing" ? "bg-brand-900 text-white" : "border border-line bg-field text-muted hover:bg-paper"}`}
              >
                Surat Keluar
              </button>
            </div>
          </div>

          <div className="p-4">
            {queueError ? (
              <ErrorBox message={queueError} onRetry={loadQueue} />
            ) : queueLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : queueRows.length === 0 ? (
              <EmptyState
                title="Antrean kosong"
                hint={
                  queueType === "incoming"
                    ? "Surat akan muncul setelah semua target disposisi selesai."
                    : "Surat akan muncul setelah surat terkirim dan siap diarsipkan."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-paper text-xs text-muted">
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Pilih semua"
                            checked={selected.size > 0 && selected.size === queueRows.length}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className="px-3 py-2">Nomor</th>
                        <th className="px-3 py-2">Perihal</th>
                        <th className="px-3 py-2">{queueType === "incoming" ? "Pengirim" : "Tujuan"}</th>
                        <th className="px-3 py-2">Tanggal Selesai</th>
                        <th className="px-3 py-2">Klasifikasi</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueRows.map((row) => (
                        <tr key={row.id} className={`border-b last:border-0 ${selected.has(row.id) ? "bg-brand-900/5" : "hover:bg-paper"}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${queueNumber(row)}`}
                              checked={selected.has(row.id)}
                              onChange={() => toggleSelected(row.id)}
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{queueNumber(row)}</td>
                          <td className="max-w-72 px-3 py-2">{row.subject}</td>
                          <td className="px-3 py-2">{queueParty(row)}</td>
                          <td className="px-3 py-2 tabular-nums text-muted">{queueDate(row)}</td>
                          <td className="px-3 py-2">{queueClassification(row)}</td>
                          <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                          <td className="px-3 py-2">
                            <Link
                              href={queueType === "incoming" ? `/surat-masuk/${row.id}` : `/surat-keluar/${row.id}`}
                              className="rounded-md border border-line bg-field px-2.5 py-1 text-xs font-medium hover:bg-paper"
                            >
                              Detail
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    disabled={submitting !== null || selected.size === 0}
                    onClick={() => void submitBatch("approve")}
                    className="rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {submitting === "approve" ? "Memproses…" : `Setujui & Arsipkan (${selected.size})`}
                  </button>
                  {canReject ? (
                    <>
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Catatan revisi (min 3 karakter)"
                        className="min-w-64 flex-1 rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                      />
                      <button
                        type="button"
                        disabled={submitting !== null || selected.size === 0}
                        onClick={() => void submitBatch("reject")}
                        className="rounded-lg border border-bad-700/30 bg-bad-100 px-3.5 py-2 text-sm font-semibold text-bad-700 hover:brightness-105 disabled:opacity-50"
                      >
                        {submitting === "reject" ? "Memproses…" : `Kembalikan (${selected.size})`}
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}

            {batchResult ? (
              <div className="mt-4 rounded-lg border border-line bg-paper p-3">
                <h3 className="text-sm font-semibold">
                  Hasil batch {batchResult.kind === "approve" ? "persetujuan" : "pengembalian"}
                </h3>
                {batchResult.approved.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-ok-700">
                    {batchResult.approved.map((row) => (
                      <li key={row.id}>✓ {batchResult.labels[row.id] ?? row.id} — {row.archiveNumber}</li>
                    ))}
                  </ul>
                ) : null}
                {batchResult.rejected.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-bad-700">
                    {batchResult.rejected.map((row) => (
                      <li key={row.id}>↩ {batchResult.labels[row.id] ?? row.id} — {row.note}</li>
                    ))}
                  </ul>
                ) : null}
                {batchResult.skipped.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {batchResult.skipped.map((row) => (
                      <li key={row.id}>• {batchResult.labels[row.id] ?? row.id} — {row.reason}</li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" onClick={() => setBatchResult(null)} className="mt-2 text-xs font-semibold text-brand-800 hover:underline">
                  Tutup ringkasan
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          <FieldFilter
            label="Sumber"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ArchiveSourceType)}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <FieldFilter
            label="Kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value as ArchiveCategory)}
            options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <FieldFilter
            label="Kode klasifikasi"
            value={classificationCode}
            onChange={(e) => setClassificationCode(e.target.value)}
            placeholder="cth: 005"
          />
          <FieldFilter
            label="Tahun"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            type="number"
            min={2000}
            max={2100}
          />
          <FieldFilter
            label="Dari tanggal"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            type="date"
          />
          <FieldFilter
            label="Sampai tanggal"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            type="date"
          />
          <FieldFilter
            label="Masuk daftar"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            placeholder="ID daftar"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor arsip, uraian, kode, lokasi fisik…"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button
            type="button"
            onClick={() => {
              setQ("");
              setSourceType("");
              setCategory("");
              setClassificationCode("");
              setYear("");
              setDateFrom("");
              setDateTo("");
              setListId("");
              setUnlisted(false);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-paper"
          >
            Reset
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={unlisted}
              onChange={(e) => setUnlisted(e.target.checked)}
              className="rounded border-line text-brand-700 focus:ring-brand-700"
            />
            Belum masuk daftar
          </label>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Tidak ada data arsip"
          hint="Coba ubah filter. Arsip dibuat dari persetujuan surat masuk/keluar."
        />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Nomor Arsip</th>
                  <th className="px-3 py-2">Tgl. Arsip</th>
                  <th className="px-3 py-2">Sumber</th>
                  <th className="px-3 py-2">Nomor Dokumen</th>
                  <th className="px-3 py-2">Uraian</th>
                  <th className="px-3 py-2">Kode Arsip</th>
                  <th className="px-3 py-2">Kode Berkas</th>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Lokasi Fisik</th>
                  <th className="px-3 py-2">Daftar / Status</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-paper">
                    <td className="px-3 py-2 font-medium">{r.archiveNumber}</td>
                    <td className="px-3 py-2 tabular-nums">{r.archiveDate.slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line">
                        {sourceLabel(r.sourceType)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.documentNumber ?? "—"}</td>
                    <td className="max-w-72 px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2">{r.code}</td>
                    <td className="px-3 py-2">{r.bundleCode ?? "—"}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2">{r.physicalLocation || locationLabel(r.location)}</td>
                    <td className="px-3 py-2">
                      {r.list ? (
                        <>
                          <div className="text-xs font-medium">{r.list.listNumber}</div>
                          <StatusBadge status={r.list.status} />
                        </>
                      ) : (
                        <span className="text-xs text-muted">Belum terdaftar</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Link
                          href={`/arsip/${r.id}`}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-paper"
                        >
                          Detail
                        </Link>
                        {canEditMetadata && r.list?.status !== "SIGNED" ? (
                          <Link
                            href={`/arsip/${r.id}`}
                            className="rounded-md bg-brand-900 px-2.5 py-1 text-xs text-white hover:bg-brand-800"
                          >
                            Ubah
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted">
                Menampilkan {items.length} dari {meta.total} data
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <span className="px-2 text-muted">Halaman {page} dari {pageCount}</span>
                <button
                  type="button"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </RequirePerm>
  );
}

function FieldFilter({
  label,
  value,
  onChange,
  options,
  type = "text",
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  options?: Array<{ value: string; label: string }>;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLSelectElement>) => void}
          className="rounded-lg border border-line bg-field px-3 py-1.5 text-sm outline-none focus:border-brand-700"
        >
          <option value="">— semua —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          min={min != null ? String(min) : undefined}
          max={max != null ? String(max) : undefined}
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
          placeholder={placeholder}
          className="rounded-lg border border-line bg-field px-3 py-1.5 text-sm outline-none focus:border-brand-700"
        />
      )}
    </div>
  );
}
