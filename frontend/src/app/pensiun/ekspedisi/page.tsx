"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { OutgoingExpeditionStatus, PensionExpeditionRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

const STATUS_LABEL: Record<OutgoingExpeditionStatus, string> = {
  BELUM_DICATAT: "Belum dicatat",
  BELUM_DIKIRIM: "Belum diserahkan",
  DIKIRIM: "Sudah diserahkan",
  DITERIMA: "Diterima tujuan",
};

const STATUS_CLASS: Record<OutgoingExpeditionStatus, string> = {
  BELUM_DICATAT: "bg-paper text-muted ring-line",
  BELUM_DIKIRIM: "bg-warn-100 text-warn-700 ring-warn-700/30",
  DIKIRIM: "bg-info-100 text-info-700 ring-info-700/30",
  DITERIMA: "bg-ok-100 text-ok-700 ring-ok-700/30",
};

export default function PensiunEkspedisiPage() {
  const { hasPermission } = useAuth();
  const canViewOutgoing = hasPermission("outgoing.view");
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Buku Ekspedisi Surat Keluar (Pensiun)</h1>
          <p className="mt-0.5 text-sm text-muted">
            Tampilan khusus surat usulan pensiun dari Buku Ekspedisi Surat Keluar. Buku agenda
            tetap mencatat surat sebagai inventaris; halaman ini mencatat serah terima kepada
            caraka dan bukti terima BKPSDMD.
          </p>
        </div>
        {canViewOutgoing ? (
          <Link
            href="/surat-keluar/ekspedisi"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-paper"
          >
            Buka Buku Ekspedisi Surat Keluar
          </Link>
        ) : null}
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
          <button
            onClick={() => void load()}
            className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Tampilkan
          </button>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-6"><Skeleton className="h-64 w-full" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Tidak ada data ekspedisi pensiun"
          hint="Baris ekspedisi muncul setelah surat usulan diregister ke Buku Agenda Surat Keluar."
        />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-paper text-xs text-muted">
                <th className="px-3 py-2">No. Registrasi</th>
                <th className="px-3 py-2">Tanggal Diserahkan</th>
                <th className="px-3 py-2">Nomor Surat</th>
                <th className="px-3 py-2">Tujuan</th>
                <th className="px-3 py-2">Caraka / Pendistribusi</th>
                <th className="px-3 py-2">PNS</th>
                <th className="px-3 py-2">Status Ekspedisi</th>
                <th className="px-3 py-2">Bukti Terima</th>
                <th className="px-3 py-2">Catatan</th>
                <th className="px-3 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 font-medium">{r.nomorEkspedisi ?? "-"}</td>
                  <td className="px-3 py-2">{r.tanggalEkspedisi ?? "-"}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.nomorSurat ?? "-"}</p>
                    {r.tanggalSurat ? (
                      <p className="text-xs text-muted">{r.tanggalSurat}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.tujuan}</td>
                  <td className="px-3 py-2">{r.penerima ?? "-"}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.jumlahPegawai}</p>
                    <p className="max-w-[220px] text-xs text-muted">
                      {r.pegawai.map((p) => p.employeeName).join(", ")}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        STATUS_CLASS[r.statusEkspedisi] ?? STATUS_CLASS.BELUM_DICATAT
                      }`}
                    >
                      {STATUS_LABEL[r.statusEkspedisi] ?? r.statusEkspedisi}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.tanggalDiterima || r.nomorTandaTerima ? (
                      <>
                        <p className="font-medium">{r.nomorTandaTerima ?? "-"}</p>
                        <p className="text-xs text-muted">
                          {r.tanggalDiterima ?? "-"}
                          {r.diterimaOleh ? ` • ${r.diterimaOleh}` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">Belum ada</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.catatan ?? "-"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pensiun/${r.batchId}`}
                      className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-paper"
                    >
                      Buka
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RequirePerm>
  );
}
