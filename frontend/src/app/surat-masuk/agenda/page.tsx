"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface AgendaRow {
  nomor: number;
  nomorAgenda: string;
  instansiAsal: string;
  instansiDitujukan: string;
  tanggalSurat: string;
  tanggalDiterima: string;
  perihal: string;
  penanggungJawab: string;
  klasifikasi: string;
  ket: string;
  keterangan: string;
  status: string;
  petugasAgenda: string[];
  activityDate?: string | null;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
  activityLocation?: string | null;
}

export default function AgendaSuratMasukPage() {
  const [tab, setTab] = useState<"hari-ini" | "besok">("hari-ini");
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [tomorrowRows, setTomorrowRows] = useState<AgendaRow[]>([]);
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

  const loadTomorrow = useCallback(async () => {
    try {
      const { data } = await apiFetch<AgendaRow[]>("/letters/agenda/tomorrow");
      setTomorrowRows(Array.isArray(data) ? data : []);
    } catch {
      /* abaikan, tab besok opsional */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "besok") void loadTomorrow();
  }, [tab, loadTomorrow]);

  const activeRows = tab === "hari-ini" ? rows : tomorrowRows;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Agenda Surat Masuk</h1>
          <p className="mt-0.5 text-sm text-muted">Digitalisasi buku agenda fisik. Kolom Keterangan = remarks surat.</p>
        </div>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setTab("hari-ini")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "hari-ini" ? "bg-brand-900 text-white" : "bg-surface text-ink border border-line hover:bg-paper"}`}
          >
            Hari Ini
          </button>
          <button
            onClick={() => setTab("besok")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "besok" ? "bg-brand-900 text-white" : "bg-surface text-ink border border-line hover:bg-paper"}`}
          >
            Agenda Besok
          </button>
          <button onClick={() => window.print()} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-paper">
            Cetak
          </button>
        </div>
      </div>

      {tab === "hari-ini" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 outline-none focus:border-brand-700" />
          <span className="text-muted">s.d.</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 outline-none focus:border-brand-700" />
          <button onClick={() => void load()} className="rounded-lg bg-brand-900 px-3 py-1.5 font-semibold text-white">
            Tampilkan
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        {loading && tab === "hari-ini" ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : activeRows.length === 0 ? (
          <EmptyState
            title={tab === "hari-ini" ? "Tidak ada baris agenda" : "Belum ada agenda besok"}
            hint={tab === "hari-ini" ? "Ubah rentang tanggal." : "Tidak ada kegiatan yang dijadwalkan untuk esok hari."}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-320 text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">No</th>
                  <th className="px-3 py-2">Nomor Agenda</th>
                  <th className="px-3 py-2">Tgl. Kegiatan</th>
                  <th className="px-3 py-2">Waktu</th>
                  <th className="px-3 py-2">Tempat</th>
                  <th className="px-3 py-2">Instansi Asal</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Petugas Agenda</th>
                  <th className="px-3 py-2 font-semibold">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => {
                  const waktu =
                    r.activityStartTime && r.activityEndTime
                      ? `${r.activityStartTime} – ${r.activityEndTime}`
                      : r.activityStartTime || r.activityEndTime || "-";
                  return (
                    <tr key={r.nomorAgenda ?? r.nomor} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.nomor}</td>
                      <td className="px-3 py-2 font-medium">{r.nomorAgenda ?? "-"}</td>
                      <td className="px-3 py-2">{r.activityDate ? r.activityDate.slice(0, 10) : r.tanggalDiterima}</td>
                      <td className="px-3 py-2">{waktu}</td>
                      <td className="px-3 py-2">{r.activityLocation ?? "-"}</td>
                      <td className="px-3 py-2">{r.instansiAsal}</td>
                      <td className="px-3 py-2">{r.perihal}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.petugasAgenda.join(", ") || "-"}</td>
                      <td className="px-3 py-2 font-medium">{r.ket || r.keterangan || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
