"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { PromotionArchiveRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function PromotionArsipPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PromotionArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (q.trim()) params.set("q", q.trim());
      const { data } = await apiFetch<PromotionArchiveRow[]>(
        `/promotion-requests/archive-book?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku arsip");
    } finally {
      setLoading(false);
    }
  }, [year, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePerm perm="promotion.view" label="Buku Arsip Kenaikan Pangkat" denyForEmployee>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            onClick={() => router.push("/kenaikan-pangkat")}
            className="text-sm font-semibold text-muted hover:text-slate-900"
          >
            ← Kembali ke daftar usulan
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor usulan, nomor surat, tujuan…"
            className="flex-1 min-w-[200px] rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <button
            onClick={() => void load()}
            className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Tampilkan
          </button>
        </div>
      </div>

      {loading && <Skeleton className="mt-3 h-64 w-full" />}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="Tidak ada data arsip" hint="Ubah tahun atau kata kunci." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2 font-medium">Tanggal Arsip</th>
                <th className="px-3 py-2 font-medium">Nomor Arsip</th>
                <th className="px-3 py-2 font-medium">Nomor Usulan</th>
                <th className="px-3 py-2 font-medium">Periode</th>
                <th className="px-3 py-2 font-medium">Nomor Surat</th>
                <th className="px-3 py-2 font-medium">Tujuan</th>
                <th className="px-3 py-2 font-medium">Kategori</th>
                <th className="px-3 py-2 font-medium">Lokasi</th>
                <th className="px-3 py-2 font-medium">Jumlah ASN</th>
                <th className="px-3 py-2 font-medium">Daftar ASN</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">{r.tanggalArsip?.slice(0, 10) ?? "-"}</td>
                  <td className="px-3 py-2.5 font-medium">{r.nomorArsip ?? "-"}</td>
                  <td className="px-3 py-2.5">{r.batchNumber}</td>
                  <td className="px-3 py-2.5">{r.periodLabel}</td>
                  <td className="px-3 py-2.5">{r.nomorSurat ?? "-"}</td>
                  <td className="px-3 py-2.5">{r.tujuan ?? "-"}</td>
                  <td className="px-3 py-2.5">{r.kategori ?? "-"}</td>
                  <td className="px-3 py-2.5">{r.lokasi ?? "-"}</td>
                  <td className="px-3 py-2.5 font-medium">{r.jumlahPegawai}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {r.pegawai.map((p) => p.employeeName).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/kenaikan-pangkat/${r.id}`}
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
      )}
    </RequirePerm>
  );
}
