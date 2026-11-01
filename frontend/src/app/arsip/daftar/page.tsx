"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { ArchiveList } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function ArsipDaftarPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("archive.update");

  const [items, setItems] = useState<ArchiveList[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (year) params.set("year", year);
      params.set("page", String(page));
      params.set("limit", "20");

      const { data, meta: m } = await apiFetch<{
        items: ArchiveList[];
        page: number;
        limit: number;
        total: number;
      }>(`/archives/lists?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setMeta(m as { page: number; limit: number; total: number } | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar arsip");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, year, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 20)));

  return (
    <RequirePerm perm="archive.view" label="Daftar Arsip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Daftar Arsip</h1>
          <p className="mt-0.5 text-sm text-muted">
            Kumpulan record arsip per periode yang telah atau belum ditandatangani.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/arsip/daftar/baru"
            className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            + Buat Daftar
          </Link>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          >
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="SIGNED">Tertandatangan</option>
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
        <EmptyState title="Tidak ada daftar arsip" hint="Buat daftar arsip baru." />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Nomor Daftar</th>
                  <th className="px-3 py-2">Periode</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Jumlah Record</th>
                  <th className="px-3 py-2">Pembuat</th>
                  <th className="px-3 py-2">Penandatangan</th>
                  <th className="px-3 py-2">Tgl. Tanda Tangan</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{l.listNumber}</td>
                    <td className="px-3 py-2">
                      {l.periodStart.slice(0, 10)} s.d. {l.periodEnd.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                    <td className="px-3 py-2 font-medium">{l.records.length}</td>
                    <td className="px-3 py-2">{l.createdBy}</td>
                    <td className="px-3 py-2">{l.signerName ?? "-"}</td>
                    <td className="px-3 py-2">{l.signedAt ? l.signedAt.slice(0, 16) : "-"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/arsip/daftar/${l.id}`}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-paper"
                      >
                        Detail
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
