"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { PensionExpeditionRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

export default function PensiunEkspedisiPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PensionExpeditionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { data } = await apiFetch<PensionExpeditionRow[]>(
        `/pension-requests/expedition-book?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku ekspedisi");
    } finally {
      setLoading(false);
    }
  }, [year, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePerm perm="pension.view" label="Buku Ekspedisi Pensiun" denyForEmployee>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Ekspedisi Pensiun</h1>
          <p className="mt-0.5 text-sm text-muted">Bukti serah terima usulan pensiun ke pendistribusi.</p>
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
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
          />
          <span className="text-muted">s.d.</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
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
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada data ekspedisi" hint="Ubah tahun atau rentang tanggal." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-paper text-xs text-muted">
                <th className="px-3 py-2">Tgl. Ekspedisi</th>
                <th className="px-3 py-2">Nomor Ekspedisi</th>
                <th className="px-3 py-2">Nomor Surat</th>
                <th className="px-3 py-2">Tujuan</th>
                <th className="px-3 py-2">Penerima / Pendistribusi</th>
                <th className="px-3 py-2">Jumlah PNS</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{r.tanggalEkspedisi ?? "-"}</td>
                  <td className="px-3 py-2 font-medium">{r.nomorEkspedisi ?? "-"}</td>
                  <td className="px-3 py-2">{r.nomorSurat ?? "-"}</td>
                  <td className="px-3 py-2">{r.tujuan}</td>
                  <td className="px-3 py-2">{r.penerima ?? "-"}</td>
                  <td className="px-3 py-2 font-medium">{r.jumlahPegawai}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">{r.catatan ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
