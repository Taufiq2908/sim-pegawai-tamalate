"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PensionRegisterRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function PensiunRegisterPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PensionRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState("");

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

  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiFetch<PensionRegisterRow[]>(
        `/pension-requests/register?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku register");
    } finally {
      setLoading(false);
    }
  }, [year, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePerm perm="pension.view" label="Buku Register Pensiun" denyForEmployee>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Register Pensiun</h1>
          <p className="mt-0.5 text-sm text-muted">Daftar berkas usulan pensiun yang tercatat.</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          >
            <option value="">Semua status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button onClick={() => void load()} className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white">
            Tampilkan
          </button>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada data register" hint="Ubah tahun atau status." />
      ) : (
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
                <th className="px-3 py-2">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.batchNumber}</td>
                  <td className="px-3 py-2">{periodLabel(r.periodYear, r.periodMonth)}</td>
                  <td className="px-3 py-2 font-medium">{r.jumlahPegawai}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">{r.nomorSurat ?? "-"}</td>
                  <td className="px-3 py-2">{r.nomorAgenda ?? "-"}</td>
                  <td className="px-3 py-2">{r.nomorEkspedisi ?? "-"}</td>
                  <td className="px-3 py-2">{r.nomorTandaTerima ?? "-"}</td>
                  <td className="px-3 py-2">{r.createdAt ? r.createdAt.slice(0, 10) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
