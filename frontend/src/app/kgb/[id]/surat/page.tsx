"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSignature } from "@/lib/signature";
import { formatRupiah } from "@/lib/format";
import type { KgbDetail } from "@/lib/types";
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

export default function SuratPengantarKgbPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoOk, setLogoOk] = useState(true);

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
  const approveEntry = timeline.find((t) => t.action === "APPROVE");
  const registerEntry = timeline.find((t) => t.action === "REGISTER");
  const camatUsername = (approveEntry?.actor ?? "").split(" ")[0] || null;
  const camatSig = camatUsername ? loadSignature(camatUsername) : null;
  // Catatan register kadang berbunyi "Nomor surat keluar: 800/..." — ambil nomornya saja.
  const nomorSurat =
    registerEntry?.note?.trim().replace(/^nomor\s+surat\s+keluar\s*[:\-]\s*/i, "") || detail.requestNumber;
  const letterDate = registerEntry?.createdAt ?? new Date().toISOString();

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

        <div className="mt-5 flex justify-between text-xs">
          <div>
            <p>Nomor&nbsp;&nbsp;: {nomorSurat}</p>
            <p>Lampiran&nbsp;&nbsp;: 1 (satu) berkas</p>
            <p>Perihal&nbsp;&nbsp;: Usulan Kenaikan Gaji Berkala</p>
          </div>
          <p>Makassar, {fmtLong(letterDate)}</p>
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

        <div className="mt-6 flex justify-end">
          <div className="w-72 text-center">
            <p className="font-bold">Camat Tamalate</p>
            {camatSig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={camatSig} alt="Tanda tangan Camat" className="mx-auto h-16 object-contain" />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-bold underline">{detail.camat?.name ?? "................"}</p>
            <p>Pangkat : Pembina</p>
            <p>Nip. {detail.camat?.nip ?? "................"}</p>
            {camatSig && approveEntry ? (
              <p className="mt-1 text-[11px]">
                Ditandatangani secara elektronik pada {new Date(approveEntry.createdAt).toLocaleString("id-ID")} (dummy, browser ini).
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
