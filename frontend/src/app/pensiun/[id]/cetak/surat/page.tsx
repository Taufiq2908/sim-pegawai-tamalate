"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { KopSurat } from "@/components/letter/kop-surat";
import { SignatureBlock } from "@/components/letter/signature-block";
import { formatTanggalSurat } from "@/lib/letter";
import type { PensionBatch } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

function periodLabel(y: number, m?: number | null): string {
  const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

/** Cetak: Surat Usulan Pensiun (paraf Sekcam + tanda tangan Camat dari signers backend). */
export default function CetakSuratUsulanPensiunPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<PensionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<PensionBatch>(`/pension-requests/${id}`);
      setBatch(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data usulan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-4xl bg-white px-8 py-6 text-sm leading-relaxed text-black print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/pensiun/${id}`} className="font-semibold text-muted hover:text-slate-900">
          ← Kembali ke detail
        </a>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Cetak
        </button>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !batch ? null : (
        <div className="border border-black p-8 print:border-0 print:p-0">
          <KopSurat />

          <div className="mt-5 flex justify-end">
            <p>
              Makassar, {formatTanggalSurat(batch.outgoingLetterDate ?? batch.updatedAt ?? new Date().toISOString())}
            </p>
          </div>

          <table className="mt-2 text-sm">
            <tbody>
              <tr>
                <td className="pr-3 align-top">Nomor</td>
                <td className="pr-2 align-top">:</td>
                <td className="font-semibold">{batch.outgoingLetterNumber || "................"}</td>
              </tr>
              <tr>
                <td className="pr-3 align-top">Sifat</td>
                <td className="pr-2 align-top">:</td>
                <td>Penting</td>
              </tr>
              <tr>
                <td className="pr-3 align-top">Lampiran</td>
                <td className="pr-2 align-top">:</td>
                <td>1 (satu) berkas</td>
              </tr>
              <tr>
                <td className="pr-3 align-top">Hal</td>
                <td className="pr-2 align-top">:</td>
                <td className="font-bold uppercase">Usulan Pensiun PNS Periode {periodLabel(batch.periodYear, batch.periodMonth)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-5 text-sm">
            <p>Kepada Yth.</p>
            <p className="font-bold">Kepala Badan Kepegawaian Daerah Kota Makassar</p>
            <p>di – Tempat</p>
          </div>

          <div className="mt-5 space-y-3 text-justify">
            <p>
              Berdasarkan hasil verifikasi berkas administrasi, dengan ini kami sampaikan usulan pensiun
              pegawai negeri sipil pada lingkungan Kecamatan Tamalate untuk periode{" "}
              <b>{periodLabel(batch.periodYear, batch.periodMonth)}</b> dengan daftar sebagai berikut:
            </p>
          </div>

          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["No", "Nama", "NIP", "Gol.", "Jabatan", "Unit Kerja", "Tgl. Pensiun", "Masa Kerja"].map((h) => (
                  <th key={h} className="border border-black px-2 py-1.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.items.map((item, i) => (
                <tr key={item.id}>
                  <td className="border border-black px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border border-black px-2 py-1.5 font-medium">{item.employeeName}</td>
                  <td className="border border-black px-2 py-1.5">{item.employeeNip ?? "-"}</td>
                  <td className="border border-black px-2 py-1.5 text-center">{item.rank ?? "-"}</td>
                  <td className="border border-black px-2 py-1.5">{item.position}</td>
                  <td className="border border-black px-2 py-1.5">{item.orgUnitName ?? "-"}</td>
                  <td className="border border-black px-2 py-1.5 text-center">{item.retirementDate.slice(0, 10)}</td>
                  <td className="border border-black px-2 py-1.5 text-center">
                    {item.yearsOfService != null ? `${item.yearsOfService} tahun` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-justify">
            Sebagai bahan pertimbangan, bersama surat ini kami lampirkan berkas persyaratan masing-masing
            pegawai. Demikian usulan ini kami sampaikan, atas perhatian dan kerja samanya kami ucapkan
            terima kasih.
          </p>

          <div className="mt-12 flex items-start justify-between">
            <SignatureBlock
              heading="Mengetahui,"
              name={batch.signers.sekcam?.name}
              nip={batch.signers.sekcam?.nip}
              rank={batch.signers.sekcam?.position}
            />
            <SignatureBlock
              heading="Camat Tamalate"
              name={batch.signers.camat?.name}
              nip={batch.signers.camat?.nip}
              rank={batch.signers.camat?.position}
            />
          </div>
        </div>
      )}
    </main>
  );
}
