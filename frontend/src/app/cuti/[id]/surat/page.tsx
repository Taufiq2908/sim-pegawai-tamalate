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
  return d
    .toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, "-");
}

function fmtLong(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Cover letter resmi kecamatan — satu baris tabel, bukan formulir isi lengkap. */
export default function SuratPengantarCutiPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoOk, setLogoOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = detail?.timeline ?? [];
  const approveEntry = timeline.find((t) => t.action === "APPROVE");
  const registerEntry = timeline.find((t) => t.action === "REGISTER");

  // Nomor surat: catatan register bila ada, lalu nomor permohonan.
  const nomorSurat =
    registerEntry?.note
      ?.replace(/^(nomor\s+surat(\s+keluar)?|no\.?)\s*[:=]\s*/i, "")
      .trim() || detail?.requestNumber || "................";

  // Prioritas Camat: snapshot approve → Camat aktif dari backend → cadangan.
  const camatName = approveEntry?.actorName || detail?.camat?.name || "MUH. ARIL SYAHBANI K, S.IP";
  const camatNip = approveEntry?.actorNip || detail?.camat?.nip || "198804152007011001";
  const camatSig = useMemo(() => {
    // Tanda tangan lokal hanya bisa dimuat bila Camat membuka/cetak di browser ini.
    if (!approveEntry || !user?.username) return null;
    const isCamat = user.position === "CAMAT" || user.employee?.name === approveEntry.actorName;
    return isCamat ? loadSignature(user.username) : null;
  }, [approveEntry, user?.username, user?.position, user?.employee?.name]);

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
  };
  const finalStatus = [
    "APPROVED",
    "SIGNED",
    "REGISTERED",
    "SUBMITTED_BKPSDMD",
    "COMPLETED",
    "ARCHIVED",
  ].includes(detail.status);
  const tanggal = fmtLong(approveEntry?.createdAt ?? new Date().toISOString());
  const cell = "border border-black px-2 py-1.5 align-top";

  return (
    <main className="bg-white font-serif text-black">
      <div className="no-print mx-auto flex max-w-3xl items-center gap-2 px-6 py-4 font-sans">
        <button
          onClick={() => window.history.back()}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Kembali
        </button>
        <a
          href={`/cuti/${detail.id}/pengajuan`}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-paper"
        >
          Surat pengajuan
        </a>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Cetak surat pengantar
        </button>
      </div>

      {!finalStatus ? (
        <div className="no-print mx-auto mb-4 max-w-3xl rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3 font-sans">
          <p className="text-sm font-semibold text-warn-700">Pratinjau surat pengantar</p>
          <p className="mt-0.5 text-xs text-secondary">
            Surat ini menjadi final setelah disetujui dan ditandatangani Camat.
          </p>
        </div>
      ) : null}

      <div className="print-full mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-relaxed">
        {/* KOP */}
        <div className="flex items-center gap-3">
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo-tamalate.png"
              alt="Logo"
              className="h-20 w-20 shrink-0 object-contain"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-black text-center text-[10px] font-sans">
              LOGO
            </div>
          )}
          <div className="flex-1 text-center">
            <p className="text-base font-bold">PEMERINTAH KOTA MAKASSAR</p>
            <p className="text-lg font-bold">KECAMATAN TAMALATE</p>
            <p className="text-xs">Jalan Danau Tanjung Bunga Utara No. 181 Makassar 90224</p>
            <p className="text-xs">Telp. +62411 - 879 249</p>
            <p className="text-xs">
              Email : tamalate.beker22@gmail.com&nbsp;&nbsp;Home page : http://www.kectamalate.com
            </p>
          </div>
        </div>
        <div className="mt-1 border-t-[3px] border-black" />
        <div className="mt-[2px] border-t border-black" />

        <div className="mt-3 flex justify-end">
          <p>Makassar, {tanggal}</p>
        </div>

        <div className="mt-2">
          <p>Yth. Kepala Bidang Mutasi</p>
          <p>BKPSDMD Kota Makassar</p>
          <p>di -</p>
          <p className="ml-6">Makassar</p>
        </div>

        <div className="mt-4 text-center">
          <p className="text-base font-bold underline">SURAT PENGANTAR</p>
          <p className="text-xs">Nomor: {nomorSurat}</p>
        </div>

        <p className="mt-4">Dengan hormat,</p>
        <p className="mt-1">
          Bersama ini kami sampaikan berkas permohonan cuti Pegawai Negeri Sipil di lingkungan
          Kecamatan Tamalate dengan rincian sebagai berikut:
        </p>

        <table className="mt-3 w-full border-collapse">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "48%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
          <thead>
            <tr>
              <td className={`${cell} text-center font-semibold`}>No</td>
              <td className={`${cell} text-center font-semibold`}>Jenis Dokumen yang Dikirim</td>
              <td className={`${cell} text-center font-semibold`}>Banyaknya</td>
              <td className={`${cell} text-center font-semibold`}>Keterangan</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${cell} text-center`}>1</td>
              <td className={cell}>
                <span className="font-semibold">
                  Berkas Permohonan Untuk {detail.leaveType?.name ?? detail.leaveType?.code}
                </span>{" "}
                a.n. {emp.name}
                <span className="block">NIP. {emp.nip ?? "................"}</span>
                <span className="block">
                  {emp.position ?? "................"}
                  {emp.rank ? `, ${emp.rank}` : ""}
                </span>
                <span className="block">
                  Periode: {fmtID(detail.startDate)} s.d. {fmtID(detail.endDate)} ({detail.totalDays} hari)
                </span>
              </td>
              <td className={`${cell} text-center`}>1 (Satu) Berkas</td>
              <td className={cell}>Berkas lengkap</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2">Dikirim dengan hormat untuk bahan seperlunya.</p>

        <div className="mt-6 flex justify-end">
          <div className="w-72 text-center">
            <p className="font-bold">Camat Tamalate,</p>
            {camatSig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={camatSig}
                alt="Tanda tangan Camat"
                className="mx-auto h-16 object-contain"
              />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-bold underline">{camatName}</p>
            <p>Pangkat : Pembina</p>
            <p>Nip. {camatNip}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
