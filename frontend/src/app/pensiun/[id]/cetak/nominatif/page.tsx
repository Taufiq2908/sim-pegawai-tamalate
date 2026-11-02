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

function tanggalID(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "................";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Cetak: Daftar Nominatif Usulan Pensiun PNS (lampiran usulan, per PNS). */
export default function CetakNominatifPensiunPage() {
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
        <div className="border border-black p-6 print:border-0 print:p-0">
          <KopSurat compact />

          <h1 className="mt-6 text-center text-base font-bold uppercase underline">
            Daftar Nominatif Usulan Pensiun PNS
          </h1>
          <p className="mt-1 text-center text-sm">
            Periode {periodLabel(batch.periodYear, batch.periodMonth)} — {batch.items.length} orang
          </p>

          <table className="mt-4 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["No", "Nama", "NIP", "Gol.", "Jabatan", "Unit Kerja", "Tgl. Lahir", "Tgl. Pensiun", "Masa Kerja", "Jenis"].map((h) => (
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
                  <td className="border border-black px-2 py-1.5 text-center">{tanggalID(item.birthDate)}</td>
                  <td className="border border-black px-2 py-1.5 text-center">{tanggalID(item.retirementDate)}</td>
                  <td className="border border-black px-2 py-1.5 text-center">
                    {item.yearsOfService != null ? `${item.yearsOfService} tahun` : "-"}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-center">{item.pensionType}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-xs">
            Usia BUP {batch.bupAge} tahun. Status berkas: {batch.statusLabel}.
            {batch.outgoingLetterNumber ? ` Nomor surat usulan: ${batch.outgoingLetterNumber}.` : ""}
          </p>

          <div className="mt-10 flex items-start justify-between">
            <SignatureBlock
              heading="Mengetahui,"
              name={batch.signers.sekcam?.name}
              nip={batch.signers.sekcam?.nip}
              rank={batch.signers.sekcam?.position}
            />
            <div className="w-72 text-center">
              <p>
                Makassar, {formatTanggalSurat(batch.outgoingLetterDate ?? batch.updatedAt ?? new Date().toISOString())}
              </p>
              <p className="mt-1 font-bold">Camat Tamalate</p>
              <div className="h-16" />
              <p className="font-bold underline">{batch.signers.camat?.name || "................"}</p>
              <p>Nip. {batch.signers.camat?.nip || "................"}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
