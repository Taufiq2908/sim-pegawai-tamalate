"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ErrorBox, Skeleton } from "@/components/ui";

interface Sheet {
  nomorAgenda: string;
  sifatSurat: string;
  tanggalPenerimaan: string;
  tanggalSurat: string;
  tanggalPenyelesaian: string | null;
  tanggalDistribusi: string | null;
  nomorSurat: string;
  asalSurat: string;
  ringkasanIsi: string | null;
  klasifikasi: string | null;
  disposisi: Array<{
    nomor: number;
    kepada: string;
    instruksi: string;
    batasWaktu: string | null;
    status: string;
    catatanTindakLanjut: string | null;
  }>;
}

export default function LembarDisposisiPage() {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<Sheet>(`/letters/${id}/disposition-sheet`);
      setSheet(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat lembar disposisi");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl bg-white px-6 py-8 text-sm text-slate-900">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => window.history.back()} className="font-semibold text-slate-600 hover:text-slate-900">
          ← Kembali
        </button>
        <button onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
          Cetak lembar disposisi
        </button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !sheet ? null : (
        <div className="border-2 border-slate-900 p-6">
          <h1 className="text-center text-lg font-bold tracking-wide">LEMBAR DISPOSISI</h1>
          <p className="text-center text-xs text-slate-600">KECAMATAN TAMALATE</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Nomor Agenda</dt><dd className="font-semibold">: {sheet.nomorAgenda}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Sifat Surat</dt><dd className="font-semibold">: {sheet.sifatSurat}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Tgl. Penerimaan</dt><dd className="font-semibold">: {sheet.tanggalPenerimaan}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Tgl. Surat</dt><dd className="font-semibold">: {sheet.tanggalSurat}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Nomor Surat</dt><dd className="font-semibold">: {sheet.nomorSurat}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Asal Surat</dt><dd className="font-semibold">: {sheet.asalSurat}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Klasifikasi</dt><dd className="font-semibold">: {sheet.klasifikasi ?? "-"}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Tgl. Penyelesaian</dt><dd className="font-semibold">: {sheet.tanggalPenyelesaian ?? "-"}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-600">Tgl. Distribusi</dt><dd className="font-semibold">: {sheet.tanggalDistribusi ? new Date(sheet.tanggalDistribusi).toLocaleString("id-ID") : "-"}</dd></div>
          </dl>
          <div className="mt-3 border-t pt-2">
            <p className="text-slate-600">Ringkasan isi:</p>
            <p className="mt-1 font-medium">{sheet.ringkasanIsi ?? "-"}</p>
          </div>
          <div className="mt-3 border-t pt-2">
            <p className="font-bold">DISPOSISI:</p>
            {sheet.disposisi.length === 0 ? (
              <p className="mt-1 text-slate-500">— belum ada disposisi —</p>
            ) : (
              <ol className="mt-1 space-y-2">
                {sheet.disposisi.map((d) => (
                  <li key={d.nomor} className="border-b pb-2 last:border-0">
                    <p><b>{d.nomor}. Kepada: {d.kepada}</b> [{d.status}]{d.batasWaktu ? ` (batas ${d.batasWaktu})` : ""}</p>
                    <p>Instruksi: {d.instruksi}</p>
                    {d.catatanTindakLanjut ? <p>Tindak lanjut: {d.catatanTindakLanjut}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 text-center">
            <div><p className="text-slate-600">Camat Tamalate</p><div className="h-16" /><p>( ........................................ )</p></div>
            <div><p className="text-slate-600">Sekretaris Camat</p><div className="h-16" /><p>( ........................................ )</p></div>
          </div>
        </div>
      )}
    </main>
  );
}
