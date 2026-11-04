"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PensionNominativeRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function PensiunNominativePage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PensionNominativeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
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

  const itemStatusLabel = (s: string): string => {
    switch (s) {
      case "PENDING": return "Menunggu";
      case "VERIFIED": return "Terverifikasi";
      case "REVISION": return "Perlu revisi";
      case "REJECTED": return "Ditolak";
      default: return s;
    }
  };

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
      if (month) params.set("month", month);
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiFetch<PensionNominativeRow[]>(
        `/pension-requests/nominative?${params.toString()}`,
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

  if (loading) {
    return (
      <RequirePerm perm="pension.view" label="Daftar Nominatif Pensiun" denyForEmployee>
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      </RequirePerm>
    );
  }
  if (error) {
    return (
      <RequirePerm perm="pension.view" label="Daftar Nominatif Pensiun" denyForEmployee>
        <ErrorBox message={error} onRetry={load} />
      </RequirePerm>
    );
  }

  return (
    <RequirePerm perm="pension.view" label="Daftar Nominatif Pensiun" denyForEmployee>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Daftar Nominatif Pensiun</h1>
          <p className="mt-0.5 text-sm text-muted">Daftar per PNS dalam berkas usulan pensiun.</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
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

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada data nominatif" hint="Ubah tahun, bulan, atau status." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-paper text-xs text-muted">
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Nomor Usulan</th>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">NIP</th>
                <th className="px-3 py-2">Golongan</th>
                <th className="px-3 py-2">Jabatan</th>
                <th className="px-3 py-2">Unit Kerja</th>
                <th className="px-3 py-2">Tgl. Pensiun</th>
                <th className="px-3 py-2">Usia BUP</th>
                <th className="px-3 py-2">Masa Kerja</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2">Status Item</th>
                <th className="px-3 py-2">Dokumen</th>
                <th className="px-3 py-2">Nomor Surat</th>
                <th className="px-3 py-2">Tanda Terima</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="border-b last:border-0">
                  <td className="px-3 py-2">{r.nomor}</td>
                  <td className="px-3 py-2 font-medium">{r.batchNumber}</td>
                  <td className="px-3 py-2">{r.employeeName}</td>
                  <td className="px-3 py-2">{r.employeeNip ?? "-"}</td>
                  <td className="px-3 py-2">{r.rank ?? "-"}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2">{r.orgUnitName ?? "-"}</td>
                  <td className="px-3 py-2">{r.retirementDate ? r.retirementDate.slice(0, 10) : "-"}</td>
                  <td className="px-3 py-2">{r.bupAge}</td>
                  <td className="px-3 py-2">{r.yearsOfService ?? "-"} th</td>
                  <td className="px-3 py-2">{r.pensionType}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line ${r.itemStatus === "VERIFIED" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
                      {itemStatusLabel(r.itemStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.documentsChecklist.length} / {r.documentsChecklist.filter((d) => d.uploaded).length}
                    {r.missingDocuments.length > 0 ? (
                      <span className="ml-1 text-xs text-bad-700">({r.missingDocuments.join(", ")})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.nomorSurat ?? "-"}</td>
                  <td className="px-3 py-2">{r.nomorTandaTerima ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
