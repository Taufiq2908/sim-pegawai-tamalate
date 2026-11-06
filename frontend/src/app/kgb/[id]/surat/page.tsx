"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSignature } from "@/lib/signature";
import { actorUsername, formatTanggalSurat, letterDate } from "@/lib/letter";
import { KopSurat } from "@/components/letter/kop-surat";
import { SignatureBlock } from "@/components/letter/signature-block";
import { formatRupiah } from "@/lib/format";
import type { KgbDetail } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

function fmtID(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10).split("-").reverse().join("-");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

export default function SuratPengantarKgbPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}`);
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

  const timeline = detail.timeline ?? [];
  const verifyEntry = timeline.find((t) => t.action === "VERIFY");
  const approveEntry = timeline.find((t) => t.action === "APPROVE");
  const registerEntry = timeline.find((t) => t.action === "REGISTER");
  const kasubagSig = loadSignature(actorUsername(verifyEntry));
  const camatSig = loadSignature(actorUsername(approveEntry));
  // Catatan register kadang berbunyi "Nomor surat keluar: 800/..." — ambil nomornya saja.
  const nomorSurat =
    registerEntry?.note?.trim().replace(/^nomor\s+surat\s+keluar\s*[:\-]\s*/i, "") || detail.requestNumber;
  const letterDateIso =
    letterDate(registerEntry?.createdAt, approveEntry?.createdAt, detail.submittedAt, detail.createdAt) ??
    new Date().toISOString();
  const finalStatus = ["REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED"].includes(detail.status);

  const emp = detail.employee;
  const cell = "border border-black px-2 py-1 align-top";
  const label = `${cell} w-1/4 bg-black/[0.03] font-semibold`;

  return (
    <main className="bg-white font-serif text-black">
      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-6 py-4 font-sans">
        <button onClick={() => window.history.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Kembali
        </button>
        <button onClick={() => window.print()} className="ml-auto rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">
          Cetak surat pengantar
        </button>
      </div>

      {!finalStatus ? (
        <div className="no-print mx-auto mb-4 max-w-3xl rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3 font-sans">
          <p className="text-sm font-semibold text-warn-700">Pratinjau surat pengantar KGB</p>
          <p className="mt-0.5 text-xs text-secondary">
            Surat ini menjadi final setelah KGB diregistrasi dan nomor surat keluar dicatat.
          </p>
        </div>
      ) : null}

      <div className="print-full relative mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-relaxed">
        {!finalStatus ? (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden opacity-[0.06] print:opacity-[0.10]">
            <span className="-rotate-[30deg] whitespace-nowrap text-[110px] font-black tracking-widest text-black">
              PRATINJAU
            </span>
          </div>
        ) : null}
        {/* KOP */}
        <KopSurat />

        <div className="mt-5 flex justify-between text-xs">
          <div>
            <p>Nomor&nbsp;&nbsp;: {nomorSurat}</p>
            <p>Lampiran&nbsp;&nbsp;: 1 (satu) berkas</p>
            <p>Perihal&nbsp;&nbsp;: Usulan Kenaikan Gaji Berkala</p>
          </div>
          <p>Makassar, {formatTanggalSurat(letterDateIso)}</p>
        </div>

        <div className="mt-4">
          <p>Kepada</p>
          <p className="font-bold">Yth. Kepala Badan Kepegawaian dan Pengembangan</p>
          <p className="font-bold">SDM Daerah Kota Makassar</p>
          <p className="font-bold">Cq. Bidang Mutasi</p>
          <p>di -</p>
          <p className="ml-6">Makassar</p>
        </div>

        <p className="mt-4">Dengan hormat,</p>
        <p className="mt-1">
          Bersama ini kami sampaikan berkas usulan Kenaikan Gaji Berkala Pegawai Negeri Sipil
          di lingkungan Kecamatan Tamalate dengan data sebagai berikut:
        </p>

        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td className={label}>Nama</td><td className={cell} colSpan={3}>{emp?.name}</td></tr>
            <tr>
              <td className={label}>NIP</td><td className={cell}>{emp?.nip ?? "................"}</td>
              <td className={label}>Jabatan</td><td className={cell}>{emp?.position ?? "................"}</td>
            </tr>
            <tr>
              <td className={label}>Unit Kerja</td><td className={cell}>{emp?.orgUnit?.name ?? "Kecamatan Tamalate"}</td>
              <td className={label}>Golongan</td><td className={cell}>{detail.oldRank} → {detail.newRank}</td>
            </tr>
            <tr>
              <td className={label}>Gaji Lama</td><td className={cell}>{formatRupiah(detail.oldSalary)}</td>
              <td className={label}>Gaji Baru</td><td className={cell}>{formatRupiah(detail.newSalary)}</td>
            </tr>
            <tr>
              <td className={label}>TMT Kenaikan</td><td className={cell}>{fmtID(detail.effectiveDate)}</td>
              <td className={label}>Nomor Pengajuan</td><td className={cell}>{detail.requestNumber}</td>
            </tr>
            {detail.note ? <tr><td className={label}>Catatan</td><td className={cell} colSpan={3}>{detail.note}</td></tr> : null}
          </tbody>
        </table>

        <table className="mt-3 w-full border-collapse">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "45%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <thead>
            <tr>
              <td className={`${cell} text-center font-semibold`}>No</td>
              <td className={`${cell} text-center font-semibold`}>Jenis Dokumen</td>
              <td className={`${cell} text-center font-semibold`}>Banyaknya</td>
              <td className={`${cell} text-center font-semibold`}>Keterangan</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${cell} text-center`}>1</td>
              <td className={cell}>
                Berkas usulan KGB a.n. {emp?.name}, NIP {emp?.nip ?? "—"}, {emp?.position ?? "—"}
              </td>
              <td className={`${cell} text-center`}>1 (Satu) Berkas</td>
              <td className={cell}>Dikirim dengan hormat untuk bahan seperlunya</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3">
          Usulan ini disampaikan berdasarkan ketentuan peraturan kepegawaian yang berlaku. Kami
          mohon kiranya dapat diproses lebih lanjut. Atas perhatian dan kerja samanya, kami
          ucapkan terima kasih.
        </p>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-8">
          {verifyEntry ? (
            <SignatureBlock
              heading="Diverifikasi oleh Kasubag Umum & Kepegawaian,"
              name={verifyEntry.actorName}
              nip={verifyEntry.actorNip}
              signature={kasubagSig}
              signedAt={verifyEntry.createdAt}
            />
          ) : (
            <div className="w-72" />
          )}
          <SignatureBlock
            heading="Camat Tamalate,"
            name={detail.camat?.name}
            nip={detail.camat?.nip}
            rank={detail.camat?.rank}
            signature={camatSig}
            signedAt={approveEntry?.createdAt}
          />
        </div>
      </div>
    </main>
  );
}
