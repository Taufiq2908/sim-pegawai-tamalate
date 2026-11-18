"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

interface OutgoingExpeditionRow {
  id: string | null;
  letterId: string;
  regNumber: string | null;
  nomorRegis: string;
  nomorSurat: string;
  tanggalSurat: string;
  perihal: string;
  instansiTujuan: string;
  penerimaSurat: string;
  courierName: string | null;
  sentDate: string | null;
  receivedDate: string | null;
  receiptNumber: string | null;
  status: "BELUM_DICATAT" | "BELUM_DIKIRIM" | "DIKIRIM" | "DITERIMA";
  note: string | null;
}

const STATUS_LABEL: Record<OutgoingExpeditionRow["status"], string> = {
  BELUM_DICATAT: "Belum dicatat",
  BELUM_DIKIRIM: "Belum diserahkan",
  DIKIRIM: "Sudah diserahkan",
  DITERIMA: "Diterima tujuan",
};

const STATUS_CLASS: Record<OutgoingExpeditionRow["status"], string> = {
  BELUM_DICATAT: "bg-paper text-muted",
  BELUM_DIKIRIM: "bg-warn-100 text-warn-700",
  DIKIRIM: "bg-info-100 text-info-700",
  DITERIMA: "bg-ok-100 text-ok-700",
};

export default function OutgoingExpeditionBookPage() {
  const [rows, setRows] = useState<OutgoingExpeditionRow[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [includeUnrecorded, setIncludeUnrecorded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (includeUnrecorded || status === "BELUM_DICATAT") params.set("includeUnrecorded", "1");
      const { data } = await apiFetch<OutgoingExpeditionRow[]>(
        `/outgoing-letters/expedition-book?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku ekspedisi surat keluar");
    } finally {
      setLoading(false);
    }
  }, [year, from, to, q, status, includeUnrecorded]);

  useEffect(() => {
    void load();
    // Pencarian/rentang diterapkan lewat tombol Tampilkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequirePerm perm="outgoing.view" label="Buku Ekspedisi Surat Keluar" denyForEmployee>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Ekspedisi Surat Keluar</h1>
          <p className="mt-0.5 text-sm text-muted">
            Buku tersendiri untuk tanda bukti pengiriman/serah terima surat keluar kepada
            caraka/pengekspedisi dan instansi tujuan. Bukan Buku Agenda Surat Keluar.
            Surat muncul di sini setelah dicatat serah terimanya; centang “Tampilkan surat yang
            belum dicatat” untuk melihat surat yang belum masuk buku ekspedisi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
        >
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
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 outline-none focus:border-brand-700"
        >
          {Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700" />
        <span className="text-muted">s.d.</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-field px-3 py-1.5 outline-none focus:border-brand-700" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 outline-none focus:border-brand-700"
        >
          <option value="">Semua status</option>
          <option value="BELUM_DICATAT">Belum dicatat</option>
          <option value="BELUM_DIKIRIM">Belum diserahkan</option>
          <option value="DIKIRIM">Sudah diserahkan</option>
          <option value="DITERIMA">Diterima tujuan</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeUnrecorded}
            onChange={(e) => setIncludeUnrecorded(e.target.checked)}
          />
          Tampilkan surat yang belum dicatat
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nomor surat / tujuan / no. registrasi…"
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
          <EmptyState
            title="Belum ada surat pada buku ekspedisi"
            hint="Catat serah terima ke caraka dari detail surat keluar. Register KGB otomatis membuat baris ekspedisi."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead>
                <tr className="border-b bg-paper text-xs text-muted">
                  <th className="px-3 py-2">No. Registrasi</th>
                  <th className="px-3 py-2">Tgl. Kirim</th>
                  <th className="px-3 py-2">Nomor Surat</th>
                  <th className="px-3 py-2">Tgl. Surat</th>
                  <th className="px-3 py-2">Tujuan</th>
                  <th className="px-3 py-2">Perihal</th>
                  <th className="px-3 py-2">Caraka</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Diterima</th>
                  <th className="px-3 py-2">No. Tanda Terima</th>
                  <th className="px-3 py-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.letterId}-${r.id ?? "pending"}`} className="border-b last:border-0 hover:bg-paper">
                    <td className="px-3 py-2 font-medium">{r.regNumber ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.sentDate ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/surat-keluar/${r.letterId}`} className="text-brand-800 hover:underline">
                        {r.nomorSurat}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.tanggalSurat}</td>
                    <td className="max-w-56 px-3 py-2">{r.instansiTujuan}</td>
                    <td className="max-w-64 px-3 py-2">{r.perihal}</td>
                    <td className="px-3 py-2">{r.courierName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.receivedDate ?? "—"}
                      {r.penerimaSurat && r.status === "DITERIMA" ? (
                        <span className="block text-xs text-muted">{r.penerimaSurat}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.receiptNumber ?? "—"}</td>
                    <td className="max-w-56 px-3 py-2 text-muted">{r.note ?? "—"}</td>
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
