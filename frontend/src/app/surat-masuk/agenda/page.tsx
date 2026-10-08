"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface AgendaRow {
  nomor: number;
  instansiDitujukan: string;
  noSurat: string;
  tanggalSurat: string;
  perihal: string;
  penanggungJawab: string;
  ket: string;
}

export default function AgendaSuratMasukPage() {
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { data } = await apiFetch<AgendaRow[]>(`/letters/register-book?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku agenda");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Buku Agenda Surat Masuk</h1>
          <p className="mt-0.5 text-sm text-slate-500">Digitalisasi buku agenda fisik. Kolom Keterangan = remarks surat.</p>
        </div>
        <button onClick={() => window.print()} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">
          Cetak
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 outline-none focus:border-slate-900" />
        <span className="text-slate-500">s.d.</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 outline-none focus:border-slate-900" />
        <button onClick={() => void load()} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">Tampilkan</button>
      </div>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="Tidak ada baris agenda" hint="Ubah rentang tanggal." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-200 text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2">No</th>
                  <th className="px-3 py-2">Instansi ditujukan</th>
                  <th className="px-3 py-2">No. surat</th>
                  <th className="px-3 py-2">Tgl. surat</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Penanggung jawab</th>
                  <th className="px-3 py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nomor} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.nomor}</td>
                    <td className="px-3 py-2">{r.instansiDitujukan}</td>
                    <td className="px-3 py-2 font-medium">{r.noSurat}</td>
                    <td className="px-3 py-2">{r.tanggalSurat}</td>
                    <td className="px-3 py-2">{r.perihal}</td>
                    <td className="px-3 py-2">{r.penanggungJawab}</td>
                    <td className="px-3 py-2">{r.ket}</td>
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
