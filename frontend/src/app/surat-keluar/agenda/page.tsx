"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface RegisterRow {
  nomor: number;
  nomorSurat: string;
  tanggalSurat: string;
  tanggalCatat: string;
  tujuan: string;
  perihal: string;
  klasifikasi: string;
  penandatangan: string;
  status: string;
}

export default function RegisterSuratKeluarPage() {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<RegisterRow[]>(`/outgoing-letters/register-book?year=${year}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku agenda");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Buku Agenda Surat Keluar</h1>
          <p className="mt-0.5 text-sm text-muted">Per nomor urut. Nomor yang dibatalkan tidak dipakai ulang.</p>
        </div>
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputMode="numeric"
          className="ml-auto w-24 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-brand-700"
        />
        <button onClick={() => window.print()} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-paper">
          Cetak
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="Tidak ada baris agenda" hint="Ubah tahun." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-220 text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">No</th>
                  <th className="px-3 py-2">Nomor surat</th>
                  <th className="px-3 py-2">Tgl. surat</th>
                  <th className="px-3 py-2">Tgl. catat</th>
                  <th className="px-3 py-2">Tujuan</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Klasifikasi</th>
                  <th className="px-3 py-2">Penandatangan</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nomor} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.nomor}</td>
                    <td className="px-3 py-2 font-medium">{r.nomorSurat}</td>
                    <td className="px-3 py-2">{r.tanggalSurat}</td>
                    <td className="px-3 py-2">{r.tanggalCatat}</td>
                    <td className="px-3 py-2">{r.tujuan}</td>
                    <td className="px-3 py-2">{r.perihal}</td>
                    <td className="px-3 py-2">{r.klasifikasi}</td>
                    <td className="px-3 py-2">{r.penandatangan}</td>
                    <td className="px-3 py-2">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
