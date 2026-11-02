"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSignature } from "@/lib/signature";
import { useAuth } from "@/lib/auth";
import { actorUsername, formatTanggalSurat, letterDate } from "@/lib/letter";
import { KopSurat } from "@/components/letter/kop-surat";
import { SignatureBlock } from "@/components/letter/signature-block";
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

/** Cover letter resmi kecamatan — satu baris tabel, bukan formulir isi lengkap. */
export default function SuratPengantarCutiPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // Penandatangan selalu dari snapshot backend; tanpa nama/NIP hardcode.
  const camatName = approveEntry?.actorName || detail?.camat?.name || null;
  const camatNip = approveEntry?.actorNip || detail?.camat?.nip || null;
  const camatRank = detail?.camat?.rank ?? null;
  const camatSig = useMemo(() => {
    const byActor = loadSignature(actorUsername(approveEntry));
    if (byActor) return byActor;
    const isCamat =
      user?.position === "CAMAT" ||
      (!!approveEntry?.actorName && user?.employee?.name === approveEntry.actorName);
    return isCamat ? loadSignature(user?.username) : null;
  }, [
    approveEntry?.createdAt,
    approveEntry?.actor,
    approveEntry?.actorName,
    approveEntry?.actorUsername,
    user?.username,
    user?.position,
    user?.employee?.name,
  ]);
  const tanggal = letterDate(registerEntry?.createdAt, approveEntry?.createdAt, detail?.submittedAt, detail?.createdAt) ?? new Date().toISOString();
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
    "REGISTERED",
    "SUBMITTED_BKPSDMD",
    "COMPLETED",
    "ARCHIVED",
  ].includes(detail.status);
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
        <KopSurat />

        <div className="mt-3 flex justify-end">
          <p>Makassar, {formatTanggalSurat(tanggal)}</p>
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
          <SignatureBlock
            heading="Camat Tamalate,"
            name={camatName}
            nip={camatNip}
            rank={camatRank}
            signature={camatSig}
            signedAt={approveEntry?.createdAt}
          />
        </div>
      </div>
    </main>
  );
}
