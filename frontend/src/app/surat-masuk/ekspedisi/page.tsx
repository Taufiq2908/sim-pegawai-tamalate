"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface EkspedisiRow {
  id: string;
  letterId: string;
  tanggalHariIni: string;
  nomorRegis: string;
  nomorSurat: string;
  tanggalSurat: string;
  perihal: string;
  penerimaSurat: string;
  paraf: string;
  asalSurat: string;
  catatan: string | null;
}

export default function EkspedisiPage() {
  const [rows, setRows] = useState<EkspedisiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<EkspedisiRow[]>("/letters/expedition-book");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku ekspedisi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Buku Ekspedisi</h1>
          <p className="mt-0.5 text-sm text-muted">Bukti surat telah diterima pihak yang dituju.</p>
        </div>
        <button onClick={() => window.print()} className="ml-auto rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-paper">
          Cetak
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada catatan ekspedisi" hint="Catat dari halaman detail surat." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-320 text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">No. registrasi</th>
                  <th className="px-3 py-2">Nomor Surat</th>
                  <th className="px-3 py-2">Tgl. Surat</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Penerima Surat</th>
                  <th className="px-3 py-2">Paraf</th>
                  <th className="px-3 py-2">Asal Surat</th>
                  <th className="px-3 py-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nomorRegis} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.tanggalHariIni}</td>
                    <td className="px-3 py-2 font-medium">{r.nomorRegis}</td>
                    <td className="px-3 py-2">{r.nomorSurat}</td>
                    <td className="px-3 py-2">{r.tanggalSurat}</td>
                    <td className="px-3 py-2">{r.perihal}</td>
                    <td className="px-3 py-2">{r.penerimaSurat}</td>
                    <td className="px-3 py-2">{r.paraf ?? "-"}</td>
                    <td className="px-3 py-2">{r.asalSurat}</td>
                    <td className="px-3 py-2">{r.catatan ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
