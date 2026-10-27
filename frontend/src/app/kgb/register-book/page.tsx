"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import type { KgbRegisterBookRow } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton } from "@/components/ui";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const cell = "border border-line px-2 py-1.5 align-top";
const head = "border border-line bg-paper px-2 py-1.5 text-left align-bottom font-semibold";

export default function KgbRegisterBookPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<KgbRegisterBookRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (y: string) => {
    setLoading(true);
    setError("");
    try {
      const { data, meta } = await apiFetch<KgbRegisterBookRow[]>(
        `/kgb-requests/register-book?year=${encodeURIComponent(y)}`,
      );
      setRows(Array.isArray(data) ? data : []);
      setTotal((meta as { total?: number } | null)?.total ?? (Array.isArray(data) ? data.length : 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat buku register KGB");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [load, year]);

  return (
    <AppShell>
      <div className="no-print flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Buku Register KGB</h1>
          <p className="text-sm text-muted">
            Register usulan KGB yang sudah disetujui beserta data gaji lama dan baru.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Tahun
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
            >
              {Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-brand-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Cetak
          </button>
          <Link
            href="/kgb/monitoring"
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium hover:bg-paper"
          >
            Monitoring
          </Link>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void load(year)} />
        ) : rows.length === 0 ? (
          <EmptyState title={`Belum ada register KGB tahun ${year}`} hint="Pilih tahun lain atau proses pengajuan KGB hingga disetujui." />
        ) : (
          <>
            <div className="mb-2 hidden print:block">
              <p className="text-center text-base font-bold">BUKU REGISTER KENAIKAN GAJI BERKALA</p>
              <p className="text-center text-sm">Kecamatan Tamalate — Tahun {year}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface print:overflow-visible print:rounded-none print:border-0">
              <table className="w-full min-w-[1280px] border-collapse text-[11px] print:min-w-0 print:text-[8px]">
                <colgroup>
                  <col style={{ width: "3%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "13%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={head} rowSpan={2}>No</th>
                    <th className={head} rowSpan={2}>Tgl SK</th>
                    <th className={head} rowSpan={2}>Nama / NIP</th>
                    <th className={head} rowSpan={2}>Gol / Pangkat</th>
                    <th className={head} rowSpan={2}>Jabatan / Unit Kerja</th>
                    <th className={head} colSpan={3}>KGB Lama</th>
                    <th className={head} colSpan={3}>KGB Baru</th>
                  </tr>
                  <tr>
                    <th className={head}>Nomor / Tgl SK</th>
                    <th className={head}>Tgl Mulai / Masa Kerja</th>
                    <th className={head}>Gol & MK / Gaji Pokok</th>
                    <th className={head}>Tgl Mulai / KGB Yad</th>
                    <th className={head}>Masa Kerja / Tahun</th>
                    <th className={head}>Gol & MK / Gaji Pokok</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.nip ?? r.nama}-${i}`}>
                      <td className={`${cell} text-center tabular-nums`}>{i + 1}</td>
                      <td className={`${cell} tabular-nums`}>{fmtDate(r.tglSk)}</td>
                      <td className={cell}>
                        <span className="font-medium">{r.nama}</span>
                        <span className="block text-muted">NIP {r.nip ?? "—"}</span>
                      </td>
                      <td className={cell}>
                        {r.gol}
                        <span className="block text-muted">{r.pangkat}</span>
                      </td>
                      <td className={cell}>
                        {r.jabatan}
                        <span className="block text-muted">{r.unitKerja}</span>
                      </td>
                      <td className={cell}>
                        {r.lama.nomorSk}
                        <span className="block text-muted">{fmtDate(r.lama.tanggalSk)}</span>
                      </td>
                      <td className={cell}>
                        {fmtDate(r.lama.tglMulai)}
                        <span className="block text-muted">{r.lama.masaKerja}</span>
                      </td>
                      <td className={cell}>
                        {r.lama.golMasaKerja}
                        <span className="block font-medium tabular-nums">{formatRupiah(r.lama.gajiPokok)}</span>
                      </td>
                      <td className={cell}>
                        {fmtDate(r.baru.tglMulai)}
                        <span className="block text-muted">KGB Yad: {fmtDate(r.baru.kgbYad)}</span>
                      </td>
                      <td className={cell}>
                        {r.baru.masaKerja}
                        <span className="block text-muted">Tahun {r.baru.tahun}</span>
                      </td>
                      <td className={cell}>
                        {r.baru.golMasaKerja}
                        <span className="block font-medium tabular-nums">{formatRupiah(r.baru.gajiPokok)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="no-print mt-2 text-sm text-muted">Total {total} baris register tahun {year}.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
