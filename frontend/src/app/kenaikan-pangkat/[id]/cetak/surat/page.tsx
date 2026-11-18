"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { KopSurat } from "@/components/letter/kop-surat";
import { SignatureBlock } from "@/components/letter/signature-block";
import { formatTanggalSurat } from "@/lib/letter";
import type { PromotionBatch } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function periodLabel(y: number, m?: number | null): string {
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

function fmtID(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10).split("-").reverse().join("-");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

/** Cetak surat pengantar usulan kenaikan pangkat ke BKPSDMD. */
export default function CetakSuratKenaikanPangkatPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<PromotionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<PromotionBatch>(`/promotion-requests/${id}`);
      setBatch(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat usulan kenaikan pangkat");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const finalStatus = batch
    ? ["REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED"].includes(batch.status)
    : false;
  const nomorSurat = batch?.outgoingLetterNumber ?? batch?.outgoingLetter?.letterNumber ?? "................";
  const tanggalSurat = batch?.outgoingLetterDate ?? batch?.outgoingLetter?.letterDate
    ?? batch?.approvedAt ?? batch?.updatedAt ?? new Date().toISOString();

  return (
    <main className="bg-white font-serif text-black">
      <div className="no-print mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-6 py-4 font-sans">
        <a href={`/kenaikan-pangkat/${id}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Kembali ke detail
        </a>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Cetak surat pengantar
        </button>
      </div>

      {loading ? (
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Skeleton className="h-96 w-full" />
        </div>
      ) : error ? (
        <div className="mx-auto max-w-5xl px-6 py-8">
          <ErrorBox message={error} onRetry={load} />
        </div>
      ) : !batch ? null : (
        <>
          {!finalStatus ? (
            <div className="no-print mx-auto mb-4 max-w-5xl rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3 font-sans">
              <p className="text-sm font-semibold text-warn-700">Pratinjau surat pengantar kenaikan pangkat</p>
              <p className="mt-0.5 text-xs text-secondary">
                Surat ini menjadi final setelah usulan dicatat di Buku Agenda Surat Keluar dan nomor surat terbit.
              </p>
            </div>
          ) : null}

          <div className="print-full relative mx-auto max-w-5xl px-6 pb-10 font-serif text-[13px] leading-relaxed">
            {!finalStatus ? (
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden opacity-[0.06] print:opacity-[0.10]">
                <span className="-rotate-[30deg] whitespace-nowrap text-[110px] font-black tracking-widest text-black">
                  PRATINJAU
                </span>
              </div>
            ) : null}

            <KopSurat />

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4 text-xs">
              <div>
                <p>Nomor&nbsp;&nbsp;: {nomorSurat}</p>
                <p>Lampiran&nbsp;&nbsp;: 1 (satu) berkas</p>
                <p>Perihal&nbsp;&nbsp;: Usulan Kenaikan Pangkat</p>
              </div>
              <p>Makassar, {formatTanggalSurat(tanggalSurat)}</p>
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
            <p className="mt-1 text-justify">
              Bersama ini kami sampaikan berkas usulan kenaikan pangkat Pegawai Negeri Sipil di
              lingkungan Kecamatan Tamalate untuk periode <b>{periodLabel(batch.periodYear, batch.periodMonth)}</b>{" "}
              dengan daftar sebagai berikut:
            </p>

            <table className="mt-3 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {["No", "Nama", "NIP", "Gol. Saat Ini", "Gol. Diusulkan", "TMT Kenaikan", "Jabatan", "Unit Kerja"].map((h) => (
                    <th key={h} className="border border-black px-1.5 py-1 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item, i) => (
                  <tr key={item.id}>
                    <td className="border border-black px-1.5 py-1 text-center">{i + 1}</td>
                    <td className="border border-black px-1.5 py-1 font-medium">{item.employeeName}</td>
                    <td className="border border-black px-1.5 py-1">{item.employeeNip ?? "-"}</td>
                    <td className="border border-black px-1.5 py-1 text-center">{item.currentRank ?? "-"}</td>
                    <td className="border border-black px-1.5 py-1 text-center">{item.targetRank}</td>
                    <td className="border border-black px-1.5 py-1 text-center">{fmtID(item.effectiveDate)}</td>
                    <td className="border border-black px-1.5 py-1">{item.position}</td>
                    <td className="border border-black px-1.5 py-1">{item.orgUnitName ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-justify">
              Sebagai bahan pertimbangan, bersama surat ini kami lampirkan berkas persyaratan
              masing-masing pegawai. Demikian usulan ini kami sampaikan, atas perhatian dan kerja
              samanya kami ucapkan terima kasih.
            </p>

            <div className="mt-10 flex items-start justify-between gap-8">
              <SignatureBlock
                heading="Mengetahui,"
                name={batch.signers.sekcam?.name}
                nip={batch.signers.sekcam?.nip}
                rank={batch.signers.sekcam?.position}
              />
              <SignatureBlock
                heading="Camat Tamalate,"
                name={batch.signers.camat?.name}
                nip={batch.signers.camat?.nip}
                rank={batch.signers.camat?.position}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
