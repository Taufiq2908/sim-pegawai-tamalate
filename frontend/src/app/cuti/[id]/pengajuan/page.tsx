"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSignature } from "@/lib/signature";
import { useAuth } from "@/lib/auth";
import type { LeaveDetail } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

function fmtID(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10).split("-").reverse().join("-");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

function fmtLong(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

interface LeaveHistoryRow {
  id?: string;
  year: string;
  leaveType?: { name: string } | null;
  days: number;
  status: string;
}

interface Balance {
  year: number;
  entitlement: number;
  used: number;
  remaining: number;
}

export default function SuratPengajuanCutiPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [history, setHistory] = useState<LeaveHistoryRow[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoOk, setLogoOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
      setDetail(data);

      try {
        const h = await apiFetch<LeaveHistoryRow[]>(`/employees/${data.employeeId}/leave-history`);
        setHistory((Array.isArray(h.data) ? h.data : []).filter((r) => r.id !== data.id));
      } catch {
        setHistory([]);
      }

      try {
        const b = await apiFetch<Balance>(`/employees/${data.employeeId}/leave-balance`);
        setBalance(b.data);
      } catch {
        setBalance(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employeeId;
  const signature = useMemo(() => (isOwner && user?.username ? loadSignature(user.username) : null), [isOwner, user?.username, detail?.id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }
  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <ErrorBox message={error} onRetry={load} />
      </main>
    );
  }
  if (!detail) return null;

  const emp = detail.employee as unknown as {
    name: string;
    nip: string | null;
    position?: string;
    rank?: string | null;
    joinDate?: string | null;
    orgUnit?: { name: string } | null;
  };
  const masaKerja = (() => {
    if (!emp.joinDate) return "................";
    const start = new Date(emp.joinDate.slice(0, 10) + "T00:00:00");
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (isNaN(months) || months < 0) return "................";
    return `${Math.floor(months / 12)} tahun ${months % 12} bulan`;
  })();

  const todayID = fmtLong(new Date().toISOString());
  const cell = "border border-black px-2 py-1 align-top";
  const label = `${cell} w-1/4 bg-black/[0.03] font-semibold`;

  return (
    <main className="bg-white font-serif text-black">
      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-6 py-4 font-sans">
        <button onClick={() => window.history.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Kembali
        </button>
        <a
          href={`/cuti/${detail.id}/surat`}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-paper"
        >
          Surat pengantar BKPSDM
        </a>
        <button onClick={() => window.print()} className="ml-auto rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">
          Cetak surat pengajuan
        </button>
      </div>

      <div className="print-full mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-relaxed">
        {/* KOP */}
        <div className="flex items-center gap-3">
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-tamalate.png" alt="Logo" className="h-20 w-20 shrink-0 object-contain" onError={() => setLogoOk(false)} />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-black text-center text-[10px] font-sans">LOGO</div>
          )}
          <div className="flex-1 text-center">
            <p className="text-base font-bold">PEMERINTAH KOTA MAKASSAR</p>
            <p className="text-lg font-bold">KECAMATAN TAMALATE</p>
            <p className="text-xs">Jalan Danau Tanjung Bunga Utara No. 181 Makassar 90224</p>
            <p className="text-xs">Telp. +62411 - 879 249</p>
            <p className="text-xs">Email : tamalate.beker22@gmail.com&nbsp;&nbsp;Home page : http://www.kectamalate.com</p>
          </div>
        </div>
        <div className="mt-1 border-t-[3px] border-black" />
        <div className="mt-[2px] border-t border-black" />

        <div className="mt-5 text-center">
          <p className="text-base font-bold underline">SURAT PERMOHONAN CUTI</p>
          <p className="text-xs">Nomor: {detail.requestNumber}</p>
        </div>

        <div className="mt-4 flex justify-end">
          <div>
            <p>Makassar, {todayID}</p>
            <p className="mt-2">Kepada</p>
            <p className="font-bold">Yth. Camat Tamalate</p>
            <p>di -</p>
            <p className="ml-6">Makassar</p>
          </div>
        </div>

        <p className="mt-4">Dengan hormat,</p>
        <p className="mt-1">
          Yang bertanda tangan di bawah ini mengajukan permohonan cuti dengan data sebagai berikut:
        </p>

        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td className={label}>Nama</td><td className={cell} colSpan={3}>{emp.name}</td></tr>
            <tr>
              <td className={label}>NIP</td><td className={cell}>{emp.nip ?? "................"}</td>
              <td className={label}>Pangkat/Golongan</td><td className={cell}>{emp.rank ?? "................"}</td>
            </tr>
            <tr>
              <td className={label}>Jabatan</td><td className={cell}>{emp.position ?? "................"}</td>
              <td className={label}>Unit Kerja</td><td className={cell}>{emp.orgUnit?.name ?? "Kecamatan Tamalate"}</td>
            </tr>
            <tr><td className={label}>Masa Kerja</td><td className={cell} colSpan={3}>{masaKerja}</td></tr>
            <tr><td className={label}>Jenis Cuti</td><td className={cell} colSpan={3}>{detail.leaveType?.name ?? detail.leaveType?.code}</td></tr>
            <tr>
              <td className={label}>Lama Cuti</td><td className={cell}>{detail.totalDays} hari</td>
              <td className={label}>Periode</td><td className={cell}>{fmtID(detail.startDate)} s.d. {fmtID(detail.endDate)}</td>
            </tr>
            <tr><td className={label}>Alasan Cuti</td><td className={cell} colSpan={3}>{detail.reason}</td></tr>
            <tr>
              <td className={label}>Alamat Selama Cuti</td><td className={cell} colSpan={3}>{detail.addressDuringLeave ?? "................"}</td>
            </tr>
            <tr>
              <td className={label}>Telepon/HP</td><td className={cell} colSpan={3}>{detail.contactDuringLeave ?? "................"}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3">
          Selama menjalankan cuti, saya akan berada pada alamat tersebut di atas dan dapat dihubungi
          melalui nomor telepon yang tercantum. Saya bersedia mematuhi ketentuan peraturan
          kepegawaian yang berlaku.
        </p>

        <div className="mt-4">
          <p className="font-bold">A. Sisa Cuti Tahunan</p>
          <table className="mt-1 w-full border-collapse">
            <tbody>
              <tr>
                <td className={`${cell} font-semibold`}>Tahun</td>
                <td className={`${cell} font-semibold`}>Hak</td>
                <td className={`${cell} font-semibold`}>Terpakai</td>
                <td className={`${cell} font-semibold`}>Sisa</td>
              </tr>
              <tr>
                <td className={cell}>{balance?.year ?? new Date().getFullYear()}</td>
                <td className={cell}>{balance ? `${balance.entitlement} hari` : "................"}</td>
                <td className={cell}>{balance ? `${balance.used} hari` : "................"}</td>
                <td className={`${cell} font-bold`}>{balance ? `${balance.remaining} hari` : "................"}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px] italic">
            Angka bersumber dari sistem kepegawaian (cuti tahunan berstatus disetujui ke atas).
          </p>
        </div>

        <div className="mt-4">
          <p className="font-bold">B. Riwayat Cuti</p>
          {history.length ? (
            <table className="mt-1 w-full border-collapse">
              <tbody>
                <tr>
                  <td className={`${cell} font-semibold`}>Tahun</td>
                  <td className={`${cell} font-semibold`}>Jenis</td>
                  <td className={`${cell} font-semibold`}>Durasi</td>
                  <td className={`${cell} font-semibold`}>Status</td>
                </tr>
                {history.map((h, i) => (
                  <tr key={h.id ?? i}>
                    <td className={cell}>{h.year}</td>
                    <td className={cell}>{h.leaveType?.name ?? "—"}</td>
                    <td className={cell}>{h.days} hari</td>
                    <td className={cell}>{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-1">Belum ada riwayat cuti tercatat.</p>
          )}
        </div>

        <p className="mt-4">
          Demikian permohonan ini saya sampaikan. Atas pertimbangan dan persetujuan Bapak, saya
          ucapkan terima kasih.
        </p>

        <div className="mt-6 flex justify-end">
          <div className="w-64 text-center">
            <p className="font-bold italic">Hormat saya,</p>
            {signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature} alt="Tanda tangan pemohon" className="mx-auto h-16 object-contain" />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-bold underline">{emp.name}</p>
            <p>Nip. {emp.nip ?? "................"}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
