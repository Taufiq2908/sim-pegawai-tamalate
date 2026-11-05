"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

interface AgendaRow {
  id?: string;
  nomor: number;
  nomorAgenda?: string;
  agendaNumber?: string;
  instansiAsal?: string;
  sender?: string;
  instansiDitujukan?: string;
  noSurat?: string;
  nomorSurat?: string;
  letterNumber?: string;
  tanggalSurat?: string;
  letterDate?: string;
  tanggalDiterima?: string;
  receivedDate?: string;
  perihal?: string;
  subject?: string;
  penanggungJawab?: string;
  pic?: string | null;
  klasifikasi?: string;
  ket?: string;
  keterangan?: string;
  remarks?: string | null;
  status: string;
  petugasAgenda?: string[];
  assignedStaff?: Array<{ id: string; name: string; username: string }>;
  activityDate?: string | null;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
  activityLocation?: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "Semua status register" },
  { value: "REVIEW_SEKCAM", label: "Menunggu Sekcam" },
  { value: "DISPOSISI_CAMAT", label: "Menunggu Disposisi Camat" },
  { value: "DITERUSKAN", label: "Diteruskan" },
  { value: "PROSES", label: "Diproses" },
  { value: "MENUNGGU_ARSIP", label: "Menunggu Arsip" },
  { value: "DIARSIPKAN", label: "Diarsipkan" },
];

function displayDate(value?: string | null) {
  return value ? value.slice(0, 10) : "—";
}

export default function AgendaSuratMasukPage() {
  const [tab, setTab] = useState<"hari-ini" | "besok">("hari-ini");
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [tomorrowRows, setTomorrowRows] = useState<AgendaRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
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
      if (status) params.set("status", status);
      const { data } = await apiFetch<AgendaRow[]>(`/letters/register-book?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku agenda");
    } finally {
      setLoading(false);
    }
  }, [from, to, q, status]);

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
    // Sengaja hanya saat status berubah; kata kunci/rentang memakai tombol Tampilkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (tab === "besok") void loadTomorrow();
  }, [tab, loadTomorrow]);

  const activeRows = tab === "hari-ini" ? rows : tomorrowRows;

  return (
    <RequirePerm perm="letter.view" label="Buku Agenda Surat Masuk" denyForEmployee>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Agenda Surat Masuk</h1>
          <p className="mt-0.5 text-sm text-muted">
            Register surat masuk. Instruksi Camat diambil dari disposisi aktif; status default menunggu Sekcam sampai diarsipkan.
          </p>
        </div>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setTab("hari-ini")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "hari-ini" ? "bg-brand-900 text-white" : "border border-line bg-surface text-ink hover:bg-paper"}`}
          >
            Register Masuk
          </button>
          <button
            type="button"
            onClick={() => setTab("besok")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "besok" ? "bg-brand-900 text-white" : "border border-line bg-surface text-ink hover:bg-paper"}`}
          >
            Agenda Besok
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper">
            Cetak
          </button>
        </div>
      </div>

      {tab === "hari-ini" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700"
          />
          <span className="text-muted">s.d.</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari perihal / nomor / pengirim…"
            className="min-w-48 rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700"
          />
          <button type="button" onClick={() => void load()} className="rounded-lg bg-brand-900 px-3 py-1.5 font-semibold text-white hover:bg-brand-800">
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
            hint={tab === "hari-ini" ? "Ubah rentang tanggal atau filter status." : "Tidak ada kegiatan yang dijadwalkan untuk esok hari."}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className={`w-full ${tab === "besok" ? "min-w-[1380px]" : "min-w-[1100px]"} text-left text-sm`}>
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">No</th>
                  <th className="px-3 py-2">Nomor Agenda</th>
                  <th className="px-3 py-2">Pengirim</th>
                  <th className="px-3 py-2">Nomor Surat</th>
                  <th className="px-3 py-2">Tanggal Surat</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Penanggung Jawab</th>
                  <th className="px-3 py-2">Instruksi Camat</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Petugas Agenda</th>
                  {tab === "besok" ? (
                    <>
                      <th className="px-3 py-2">Kegiatan</th>
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2">Tempat</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r, index) => {
                  const nomorAgenda = r.nomorAgenda ?? r.agendaNumber ?? "—";
                  const pengirim = r.instansiAsal ?? r.sender ?? "—";
                  const nomorSurat = r.noSurat ?? r.nomorSurat ?? r.letterNumber ?? "—";
                  const perihal = r.perihal ?? r.subject ?? "—";
                  const penanggungJawab =
                    r.penanggungJawab ??
                    r.pic ??
                    r.assignedStaff?.map((s) => s.name).join(", ") ??
                    "—";
                  const instruksi = r.ket ?? r.keterangan ?? r.remarks ?? "—";
                  const petugas =
                    r.petugasAgenda?.join(", ") ??
                    r.assignedStaff?.map((s) => s.name).join(", ") ??
                    "—";
                  const tanggalKegiatan = r.activityDate ?? r.tanggalDiterima ?? r.receivedDate;
                  const waktu =
                    r.activityStartTime && r.activityEndTime
                      ? `${r.activityStartTime} – ${r.activityEndTime}`
                      : r.activityStartTime || r.activityEndTime || "—";
                  return (
                    <tr key={r.id ?? `${nomorAgenda}-${index}`} className="border-b last:border-0 hover:bg-paper">
                      <td className="px-3 py-2 tabular-nums text-muted">{r.nomor ?? index + 1}</td>
                      <td className="px-3 py-2 font-medium">{nomorAgenda}</td>
                      <td className="px-3 py-2">{pengirim}</td>
                      <td className="px-3 py-2">{nomorSurat}</td>
                      <td className="px-3 py-2 tabular-nums">{displayDate(r.tanggalSurat ?? r.letterDate)}</td>
                      <td className="max-w-72 px-3 py-2">{perihal}</td>
                      <td className="px-3 py-2">{penanggungJawab || "—"}</td>
                      <td className="max-w-64 px-3 py-2">{instruksi || "—"}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2">{petugas || "—"}</td>
                      {tab === "besok" ? (
                        <>
                          <td className="px-3 py-2 tabular-nums">{displayDate(tanggalKegiatan)}</td>
                          <td className="px-3 py-2 tabular-nums">{waktu}</td>
                          <td className="px-3 py-2">{r.activityLocation ?? "—"}</td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
