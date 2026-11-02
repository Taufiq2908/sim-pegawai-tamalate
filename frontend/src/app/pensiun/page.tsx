"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PensionBatch, PensionStatus } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function PensiunPage() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<PensionBatch[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<PensionStatus | "">("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (year) params.set("year", year);
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("limit", "10");

      const { data, meta: m } = await apiFetch<{
        items: PensionBatch[];
        page: number;
        limit: number;
        total: number;
      }>(`/pension-requests?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as { page: number; limit: number; total: number } | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar usulan pensiun");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, year, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
function periodLabel(y: number, m?: number | null): string {
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}
const STATUS_OPTIONS: Array<{ value: PensionStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "VERIFIED", label: "Terverifikasi" },
  { value: "PARAF", label: "Paraf" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REGISTERED", label: "Terdaftar" },
  { value: "EXPEDITED", label: "Diekspedisi" },
  { value: "SENT", label: "Terkirim" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "ARCHIVED", label: "Diarsipkan" },
  { value: "REVISION", label: "Revisi" },
  { value: "REJECTED", label: "Ditolak" },
];

const pageCount = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 10)));

  return (
    <RequirePerm perm="pension.view" label="Pensiun PNS">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Daftar Usulan Pensiun</h1>
          <p className="mt-0.5 text-sm text-muted">
            Daftar berkas usulan pensiun PNS per periode.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PensionStatus)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          >
            <option value="">Semua status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Tahun"
            className="w-24 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor usulan, nama, NIP…"
            className="flex-1 min-w-[200px] rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button onClick={() => void load()} className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white">
            Tampilkan
          </button>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Tidak ada usulan pensiun" hint="Ubah filter atau buat usulan baru dari BUP." />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Nomor Usulan</th>
                  <th className="px-3 py-2">Periode</th>
                  <th className="px-3 py-2">Jumlah PNS</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Nomor Surat</th>
                  <th className="px-3 py-2">Nomor Agenda</th>
                  <th className="px-3 py-2">Ekspedisi</th>
                  <th className="px-3 py-2">Tanda Terima</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{b.batchNumber}</td>
                    <td className="px-3 py-2">{periodLabel(b.periodYear, b.periodMonth)}</td>
                    <td className="px-3 py-2 font-medium">{b.items?.length ?? 0}</td>
                    <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-2">{b.outgoingLetterNumber ?? "-"}</td>
                    <td className="px-3 py-2">{b.agendaNumber ?? "-"}</td>
                    <td className="px-3 py-2">{b.expeditionNumber ?? "-"}</td>
                    <td className="px-3 py-2">{b.receiptNumber ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/pensiun/${b.id}`}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-paper"
                      >
                        Buka
                      </Link>
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
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <span className="px-2 text-muted">Halaman {page} dari {pageCount}</span>
                <button
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
