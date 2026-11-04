"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PromotionBatch } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

function periodLabel(y: number, m?: number | null): string {
  const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

export default function PromotionRegisterPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PromotionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiFetch<PromotionBatch[]>(
        `/promotion-requests/register?${params.toString()}`,
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

  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "DRAFT", label: "Draft" },
    { value: "LEGALIZED", label: "Legalisasi" },
    { value: "VERIFIED", label: "Terverifikasi" },
    { value: "PARAF", label: "Paraf" },
    { value: "APPROVED", label: "Disetujui" },
    { value: "REGISTERED", label: "Diregistrasi" },
    { value: "ARCHIVED", label: "Diarsipkan" },
    { value: "REVISION", label: "Revisi" },
    { value: "REJECTED", label: "Ditolak" },
  ];

  return (
    <RequirePerm perm="promotion.view" label="Buku Register Kenaikan Pangkat">
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
        <EmptyState title="Tidak ada data register" hint="Ubah tahun atau status." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2 font-medium">Nomor Usulan</th>
                <th className="px-3 py-2 font-medium">Periode</th>
                <th className="px-3 py-2 font-medium">Jumlah ASN</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Nomor Surat</th>
                <th className="px-3 py-2 font-medium">Nomor Agenda</th>
                <th className="px-3 py-2 font-medium">Nomor Arsip</th>
                <th className="px-3 py-2 font-medium">Tanggal Arsip</th>
                <th className="px-3 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 font-medium">{r.batchNumber}</td>
                  <td className="px-3 py-2.5">{periodLabel(r.periodYear, r.periodMonth)}</td>
                  <td className="px-3 py-2.5 font-medium">{r.items.length}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5">{r.outgoingLetterNumber ?? "-"}</td>
                  <td className="px-3 py-2.5">{r.agendaNumber ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    {r.outgoingLetter?.archiveRecord?.archiveNumber ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.outgoingLetter?.archiveRecord?.archiveDate ? r.outgoingLetter.archiveRecord.archiveDate.slice(0, 10) : "-"}
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
