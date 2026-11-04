"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { PromotionNominativeRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

function itemStatusLabel(s: string): string {
  switch (s) {
    case "PENDING": return "Menunggu";
    case "LEGALIZED": return "Legalisasi";
    case "VERIFIED": return "Terverifikasi";
    case "PARAF": return "Paraf";
    case "APPROVED": return "Disetujui";
    case "REGISTERED": return "Diregistrasi";
    case "ARCHIVED": return "Diarsipkan";
    case "REVISION": return "Revisi";
    case "REJECTED": return "Ditolak";
    default: return s;
  }
}

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

export default function PromotionNominatifPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PromotionNominativeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (month) params.set("month", month);
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiFetch<PromotionNominativeRow[]>(
        `/promotion-requests/nominative?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar nominatif");
    } finally {
      setLoading(false);
    }
  }, [year, month, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePerm perm="promotion.view" label="Daftar Nominatif Kenaikan Pangkat" denyForEmployee>
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
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="Bulan"
            className="w-20 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
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
        <EmptyState title="Tidak ada data nominatif" hint="Ubah tahun, bulan, atau status." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2 font-medium">No</th>
                <th className="px-3 py-2 font-medium">Nomor Usulan</th>
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">NIP</th>
                <th className="px-3 py-2 font-medium">Gol. Saat Ini</th>
                <th className="px-3 py-2 font-medium">TMT Pangkat</th>
                <th className="px-3 py-2 font-medium">Gol. Diusulkan</th>
                <th className="px-3 py-2 font-medium">TMT Kenaikan</th>
                <th className="px-3 py-2 font-medium">Masa Jabatan</th>
                <th className="px-3 py-2 font-medium">Jabatan</th>
                <th className="px-3 py-2 font-medium">Unit Kerja</th>
                <th className="px-3 py-2 font-medium">Status Item</th>
                <th className="px-3 py-2 font-medium">Dokumen</th>
                <th className="px-3 py-2 font-medium">Nomor Surat</th>
                <th className="px-3 py-2 font-medium">Nomor Agenda</th>
                <th className="px-3 py-2 font-medium">Nomor Arsip</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.itemId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">{item.nomor}</td>
                  <td className="px-3 py-2.5 font-medium">{item.batchNumber}</td>
                  <td className="px-3 py-2.5">{item.employeeName}</td>
                  <td className="px-3 py-2.5 text-muted">{item.employeeNip ?? "—"}</td>
                  <td className="px-3 py-2.5">{item.currentRank ?? "—"}</td>
                  <td className="px-3 py-2.5">{item.currentRankTmt?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2.5">{item.targetRank}</td>
                  <td className="px-3 py-2.5">{item.effectiveDate?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{item.yearsInCurrentRank ?? "—"} th</td>
                  <td className="px-3 py-2.5">{item.position}</td>
                  <td className="px-3 py-2.5">{item.orgUnitName ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded bg-paper px-1.5 py-0.5 text-[11px] ring-1 ring-inset ring-line ${
                      item.itemStatus === "VERIFIED" || item.itemStatus === "APPROVED"
                        ? "bg-ok-100 text-ok-700"
                        : "bg-warn-100 text-warn-700"
                    }`}>
                      {item.itemStatusLabel ?? itemStatusLabel(item.itemStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {item.documentsChecklist.filter((d) => d.uploaded).length} / {item.documentsChecklist.length}
                    {item.missingDocuments.length > 0 && (
                      <span className="ml-1 text-xs text-bad-700">({item.missingDocuments.length} kurang)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{item.nomorSurat ?? "-"}</td>
                  <td className="px-3 py-2.5">{item.nomorAgenda ?? "-"}</td>
                  <td className="px-3 py-2.5">{item.nomorArsip ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
