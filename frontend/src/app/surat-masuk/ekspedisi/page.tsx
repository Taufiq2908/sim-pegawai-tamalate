"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface EkspedisiRow {
  id: string;
  letterId: string;
  tanggalHariIni: string;
  nomorRegis: string;
  nomorAgenda?: string;
  nomorSurat: string;
  tanggalSurat: string;
  perihal: string;
  penerimaSurat: string;
  paraf: string;
  asalSurat: string;
  jamTerima?: string;
  waktuTerima?: string;
  catatan: string | null;
}

export default function EkspedisiPage() {
  const [rows, setRows] = useState<EkspedisiRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q.trim()) params.set("q", q.trim());
      const { data } = await apiFetch<EkspedisiRow[]>(`/letters/expedition-book?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku ekspedisi");
    } finally {
      setLoading(false);
    }
  }, [from, to, q]);

  useEffect(() => {
    void load();
    // Pencarian/rentang diterapkan lewat tombol Tampilkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequirePerm perm="letter.view" label="Buku Ekspedisi" denyForEmployee>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Ekspedisi</h1>
          <p className="mt-0.5 text-sm text-muted">
            Baris tercatat otomatis saat penerima disposisi menekan <strong>Terima &amp; Baca</strong>. Tidak ada pencatatan manual.
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper">
          Cetak
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="mt-3 flex flex-wrap items-center gap-2 text-sm"
      >
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700" />
        <span className="text-muted">s.d.</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pengirim / perihal / nomor surat…"
          className="min-w-56 rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700"
        />
        <button type="submit" className="rounded-lg bg-brand-900 px-3 py-1.5 font-semibold text-white hover:bg-brand-800">
          Tampilkan
        </button>
      </form>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada catatan ekspedisi" hint="Catatan muncul setelah penerima disposisi menerima surat." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Jam</th>
                  <th className="px-3 py-2">No. Registrasi</th>
                  <th className="px-3 py-2">No. Agenda</th>
                  <th className="px-3 py-2">Asal Surat</th>
                  <th className="px-3 py-2">Nomor Surat</th>
                  <th className="px-3 py-2">Tanggal Surat</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Penerima</th>
                  <th className="px-3 py-2">Paraf</th>
                  <th className="px-3 py-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-paper">
                    <td className="px-3 py-2 tabular-nums">{r.tanggalHariIni}</td>
                    <td className="px-3 py-2 tabular-nums">{r.jamTerima ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.nomorRegis}</td>
                    <td className="px-3 py-2">
                      <Link href={`/surat-masuk/${r.letterId}`} className="text-brand-800 hover:underline">
                        {r.nomorAgenda ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.asalSurat}</td>
                    <td className="px-3 py-2">{r.nomorSurat}</td>
                    <td className="px-3 py-2 tabular-nums">{r.tanggalSurat}</td>
                    <td className="max-w-64 px-3 py-2">{r.perihal}</td>
                    <td className="px-3 py-2">{r.penerimaSurat}</td>
                    <td className="px-3 py-2">{r.paraf || "—"}</td>
                    <td className="max-w-56 px-3 py-2 text-muted">{r.catatan || "—"}</td>
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
