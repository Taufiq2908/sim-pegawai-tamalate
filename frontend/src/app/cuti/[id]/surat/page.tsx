"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSignature } from "@/lib/signature";
import { SignaturePad } from "@/components/signature";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import type { LeaveDetail } from "@/lib/types";
import { ErrorBox, Skeleton } from "@/components/ui";

function fmtID(iso?: string | null): string {
  if (!iso) return "................";
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10).split("-").reverse().join("-");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

const JENIS: Array<{ code: string; label: string }> = [
  { code: "TAHUNAN", label: "1. Cuti Tahunan" },
  { code: "BESAR", label: "2. Cuti Besar" },
  { code: "SAKIT", label: "3. Cuti sakit" },
  { code: "MELAHIRKAN", label: "4. Cuti Melahirkan" },
  { code: "ALASAN_PENTING", label: "5. Cuti Karena Alasan Penting" },
  { code: "DILUAR_TANGGUNGAN", label: "6. Cuti Di Luar Tanggungan Negara" },
];

function actorPosition(actor?: string | null): string {
  const m = /\((?:[^/]*\/)?([^)]+)\)/.exec(actor ?? "");
  return (m?.[1] ?? "").trim();
}

const JABATAN_ID: Record<string, string> = {
  SEKCAM: "Sekretaris Camat",
  CAMAT: "Camat",
  LURAH: "Lurah",
  KASI: "Kepala Seksi",
  KASUBAG: "Kasubag Umum & Kepegawaian",
  VERIFIKATOR: "Verifikator",
  STAF: "Staf",
};

export default function SuratPengantarCutiPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ year: string; type: string; days: number; status: string }>>([]);
  const [logoOk, setLogoOk] = useState(true);
  const [sigTick, setSigTick] = useState(0);
  const [signAct, setSignAct] = useState<string | null>(null);
  const [signNote, setSignNote] = useState("");
  const [signing, setSigning] = useState(false);
  // Tanda tangan dummy per penandatangan — dihitung dari detail bila sudah ada.
  const atasanSig = useMemo(() => {
    const tl = detail?.timeline ?? [];
    const entry = tl.find((t) => t.action === "REVIEW") ?? tl.find((t) => t.action === "PARAF");
    const username = (entry?.actor ?? "").split(" ")[0] || null;
    return sigTick >= 0 && username ? loadSignature(username) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigTick, detail?.id]);
  const camatSig = useMemo(() => {
    const entry = (detail?.timeline ?? []).find((t) => t.action === "APPROVE");
    const username = (entry?.actor ?? "").split(" ")[0] || null;
    return sigTick >= 0 && username ? loadSignature(username) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigTick, detail?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
      setDetail(data);
      // Riwayat cuti pemohon dari endpoint resmi (best-effort; sembunyikan bila gagal).
      try {
        const h = await apiFetch<Array<{ year: string; leaveType: { name: string }; days: number; status: string }>>(
          `/employees/${data.employeeId}/leave-history`,
        );
        const rows = (Array.isArray(h.data) ? h.data : [])
          .filter((r) => (r as unknown as { id: string }).id !== data.id)
          .map((r) => ({ year: r.year, type: r.leaveType?.name ?? "—", days: r.days, status: r.status }));
        setHistory(rows);
      } catch {
        setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const act = new URLSearchParams(window.location.search).get("act");
    if (act === "review" || act === "approve") setSignAct(act);
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

  const emp = detail.employee as unknown as {
    name: string;
    nip: string | null;
    position?: string;
    rank?: string | null;
    joinDate?: string | null;
  };
  const masaKerja = (() => {
    if (!emp.joinDate) return "";
    const start = new Date(emp.joinDate.slice(0, 10) + "T00:00:00");
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (isNaN(months) || months < 0) return "";
    return `${Math.floor(months / 12)} tahun ${months % 12} bulan`;
  })();
  const isOwner = user?.employee?.id === detail.employee?.id;
  const unitKerja = (isOwner ? user?.orgUnit?.name : null) ?? "..............................";
  const code = detail.leaveType?.code;
  const viiSetuju = ["PARAF", "APPROVED", "SIGNED", "REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED", "FORWARDED"].includes(detail.status);
  const viiTolak = detail.status === "REJECTED";
  const viiiSetuju = ["APPROVED", "SIGNED", "REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED"].includes(detail.status);
  const viiiTolak = detail.status === "REJECTED";
  const findEntry = (action: string) => (detail.timeline ?? []).find((t) => t.action === action);
  const reviewEntry = findEntry("REVIEW");
  const parafEntry = findEntry("PARAF");
  const approveEntry = findEntry("APPROVE");
  const atasanEntry = reviewEntry ?? parafEntry;
  const atasanUsername = (atasanEntry?.actor ?? "").split(" ")[0] || null;
  const atasanName = atasanEntry?.actorName ?? "";
  const atasanNip = atasanEntry?.actorNip ?? "";
  const atasanJabatan = JABATAN_ID[actorPosition(atasanEntry?.actor)] ?? "";
  const atasanTime = atasanEntry ? new Date(atasanEntry.createdAt).toLocaleString("id-ID") : "";
  const camatUsername = (approveEntry?.actor ?? "").split(" ")[0] || null;
  const camatName = approveEntry?.actorName || "MUH. ARIL SYAHBANI K, S.IP";
  const camatNip = approveEntry?.actorNip || "198804152007011001";
  const camatTime = approveEntry ? new Date(approveEntry.createdAt).toLocaleString("id-ID") : "";

  const check = (on: boolean) => (on ? "✓" : "");

  async function confirmSign() {
    if (!signAct || !detail) return;
    if (!loadSignature(user?.username)) {
      toast.error("Gambar tanda tangan dulu pada panel di bawah.");
      return;
    }
    setSigning(true);
    try {
      await apiFetch(`/leave-requests/${detail.id}/${signAct}`, {
        method: "POST",
        body: JSON.stringify({ note: signNote.trim() || undefined }),
      });
      toast.success("Ditandatangani dan diteruskan.");
      window.location.href = `/cuti/${detail.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses");
    } finally {
      setSigning(false);
    }
  }

  const cell = "border border-black px-2 py-1";
  const todayID = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="bg-white font-serif text-black">
      <div className="no-print mx-auto flex max-w-3xl items-center gap-2 px-6 py-4 font-sans">
        <button onClick={() => window.history.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Kembali
        </button>
        <button onClick={() => window.print()} className="ml-auto rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">
          Cetak surat pengantar
        </button>
      </div>

      {signAct && detail?.availableActions?.includes(signAct) ? (
        <div className="no-print mx-auto mb-4 max-w-3xl rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3 font-sans">
          <p className="text-sm font-semibold">
            {signAct === "review" ? "Pertimbangan & tanda tangan atasan langsung" : "Persetujuan & tanda tangan Camat"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Gambar tanda tangan di bawah, lalu tekan tombol konfirmasi — status baru diperbarui
            dan diteruskan setelah itu.
          </p>
          <div className="mt-2">
            {user?.username ? (
              <SignaturePad username={user.username} onSaved={() => setSigTick((n) => n + 1)} />
            ) : null}
          </div>
          <input
            value={signNote}
            onChange={(e) => setSignNote(e.target.value)}
            placeholder="Catatan (opsional)"
            className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none"
          />
          <button
            disabled={signing}
            onClick={() => void confirmSign()}
            className="mt-2 w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {signing ? "Memproses…" : "Sudah tandatangan — teruskan"}
          </button>
        </div>
      ) : null}

      <details className="no-print mx-auto mb-4 max-w-3xl rounded-lg border border-dashed border-line bg-paper px-4 py-3 font-sans">        <summary className="cursor-pointer text-sm font-semibold">
          Tanda tangan elektronik saya (dummy — tersimpan di browser ini saja)
        </summary>
        <p className="mt-1 text-xs text-muted">
          Gambar di bawah, lalu cetak surat: gambar muncul di blok penandatangan yang aksinya
          Anda lakukan (login sebagai akun tersebut di browser ini).
          Versi produksi membutuhkan penyimpanan server (docs/06 B11).
        </p>
        <div className="mt-2">
          {user?.username ? (
            <SignaturePad username={user.username} onSaved={() => setSigTick((n) => n + 1)} />
          ) : (
            <p className="text-sm text-muted">Login dulu untuk membuat tanda tangan.</p>
          )}
        </div>
      </details>

      <div className="mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-snug">
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
            <p className="text-xs">Email : tamalate.beker22@gmail.com&nbsp;&nbsp;Home page : http://www.kectamalate.com</p>
          </div>
        </div>
        <div className="mt-1 border-t-[3px] border-black" />
        <div className="mt-[2px] border-t border-black" />

        {/* TUJUAN */}
        <div className="mt-2 flex justify-end">
          <div>
            <p>Makassar, {todayID}</p>
            <p className="mt-2">Kepada</p>
            <p className="font-bold italic">Yth. Wali Kota Makassar</p>
            <p className="font-bold italic">Cq. Kepala Badan Kepegawaian dan</p>
            <p className="font-bold italic">Pengembangan SDM Daerah Kota Makassar</p>
            <p>Di -</p>
            <p className="ml-8">Makassar</p>
          </div>
        </div>

        {/* I */}
        <table className="mt-3 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} font-bold`}>I. DATA PEGAWAI</td></tr>
            <tr>
              <td className={`${cell} w-1/4`}>Nama</td><td className={cell}>{emp.name}</td>
              <td className={`${cell} w-1/6`}>NIP</td><td className={cell}>{emp.nip ?? ""}</td>
            </tr>
            <tr>
              <td className={cell}>Jabatan</td><td className={cell}>{emp.position ?? ""}</td>
              <td className={cell}>Masa Kerja</td><td className={cell}>{masaKerja}</td>
            </tr>
            <tr>
              <td className={cell}>Unit Kerja</td><td colSpan={3} className={cell}>{unitKerja}</td>
            </tr>
          </tbody>
        </table>

        {/* II */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} font-bold`}>II. JENIS CUTI YANG DIAMBIL</td></tr>
            {[0, 2, 4].map((i) => (
              <tr key={i}>
                <td className={`${cell} w-2/5`}>{JENIS[i].label}</td>
                <td className={`${cell} w-1/10 text-center font-bold`}>{check(code === JENIS[i].code)}</td>
                <td className={`${cell} w-2/5`}>{JENIS[i + 1].label}</td>
                <td className={`${cell} text-center font-bold`}>{check(code === JENIS[i + 1].code)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* III */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td className={`${cell} font-bold`}>III. ALASAN CUTI</td></tr>
            <tr><td className={`${cell} min-h-8`}>{detail.reason}</td></tr>
          </tbody>
        </table>

        {/* IV */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={6} className={`${cell} font-bold`}>IV. LAMA CUTI</td></tr>
            <tr>
              <td className={`${cell} w-1/6`}>Selama</td>
              <td className={`${cell} w-1/6 font-bold`}>{detail.totalDays} hari</td>
              <td className={`${cell} w-1/6`}>Mulai Tanggal</td>
              <td className={`${cell} w-1/6`}>{fmtID(detail.startDate)}</td>
              <td className={`${cell} w-1/12 text-center`}>s/d</td>
              <td className={cell}>{fmtID(detail.endDate)}</td>
            </tr>
          </tbody>
        </table>

        {/* V */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} font-bold`}>V. CATATAN CUTI</td></tr>
            <tr>
              <td className={`${cell} w-1/4 font-bold`}>1. CUTI TAHUNAN</td>
              <td className={cell} />
              <td className={`${cell} w-1/4 font-bold`}>2. CUTI BESAR</td>
              <td className={cell} />
            </tr>
            <tr>
              <td className={`${cell} text-xs`}>Tahun&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Sisa&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Keterangan</td>
              <td className={cell} />
              <td className={`${cell} font-bold`}>3. CUTI SAKIT</td>
              <td className={cell} />
            </tr>
            <tr>
              <td className={cell}>&nbsp;</td>
              <td className={cell} />
              <td className={`${cell} font-bold`}>4. CUTI MELAHIRKAN</td>
              <td className={cell} />
            </tr>
            <tr>
              <td className={cell}>&nbsp;</td>
              <td className={cell} />
              <td className={`${cell} font-bold`}>5. CUTI KARENA ALASAN PENTING</td>
              <td className={cell} />
            </tr>
            <tr>
              <td className={cell}>&nbsp;</td>
              <td className={cell} />
              <td className={`${cell} font-bold`}>6. CUTI DILUAR TANGGUNGAN NEGARA</td>
              <td className={cell} />
            </tr>
          </tbody>
        </table>

        {/* VI */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} font-bold`}>VI. ALAMAT SELAMA MENJALANKAN CUTI</td></tr>
            <tr>
              <td className={`${cell} w-3/5`}>{detail.addressDuringLeave ?? ""}</td>
              <td className={`${cell} w-1/6 text-center`}>Telp</td>
              <td className={cell}>{detail.contactDuringLeave ?? ""}</td>
            </tr>
          </tbody>
        </table>

        {/* RIWAYAT SISTEM — lampiran di bawah formulir resmi, bukan mengubah layout resmi */}
        {history.length > 0 ? (
          <div className="mt-2">
            <p className="font-bold">LAMPIRAN — RIWAYAT CUTI PEGAWAI (dari sistem)</p>
            <table className="mt-1 w-full border-collapse">
              <tbody>
                <tr>
                  <td className={`${cell} font-bold`}>Tahun</td>
                  <td className={`${cell} font-bold`}>Jenis</td>
                  <td className={`${cell} font-bold`}>Durasi</td>
                  <td className={`${cell} font-bold`}>Status</td>
                </tr>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className={cell}>{h.year}</td>
                    <td className={cell}>{h.type}</td>
                    <td className={cell}>{h.days} hari</td>
                    <td className={cell}>{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex justify-end">
          <div className="w-64 text-center">
            <p className="mt-1 font-bold italic">Hormat Saya,</p>
            <div className="h-16" />
            <p className="font-bold underline">{emp.name}</p>
            <p>Nip. {emp.nip ?? "................"}</p>
          </div>
        </div>

        {/* VII */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} text-center font-bold`}>VII. PERTIMBANGAN ATASAN LANGSUNG</td></tr>
            <tr className="text-center italic">
              <td className={cell}>DISETUJUI {check(viiSetuju)}</td>
              <td className={cell}>PERUBAHAN</td>
              <td className={cell}>DITANGGUHKAN</td>
              <td className={cell}>TIDAK DISETUJUI {check(viiTolak)}</td>
            </tr>
            <tr>
              <td colSpan={3} className={`${cell} h-10 font-bold`}>
                {atasanSig ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={atasanSig} alt="Tanda tangan atasan" className="h-12 object-contain" />
                ) : (
                  atasanName
                )}
              </td>
              <td className={`${cell} text-center font-bold`}>Jabatan<br />{atasanJabatan}</td>
            </tr>
            <tr>
              <td colSpan={3} className={cell}>
                {atasanSig && atasanTime ? (
                  <span className="text-[11px]">Ditandatangani secara elektronik oleh {atasanName} pada {atasanTime} (dummy, browser ini).</span>
                ) : null}
              </td>
              <td className={`${cell} text-center`}>Nip. {atasanNip || "................"}</td>
            </tr>
          </tbody>
        </table>

        {/* VIII */}
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td colSpan={4} className={`${cell} text-center font-bold`}>VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI</td></tr>
            <tr className="text-center italic">
              <td className={cell}>DISETUJUI {check(viiiSetuju)}</td>
              <td className={cell}>PERUBAHAN</td>
              <td className={cell}>DITANGGUHKAN</td>
              <td className={cell}>TIDAK DISETUJUI {check(viiiTolak)}</td>
            </tr>
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-72 border border-black p-2 text-center">
            <p className="font-bold">Camat Tamalate</p>
            {camatSig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={camatSig} alt="Tanda tangan camat" className="mx-auto h-14 object-contain" />
            ) : (
              <div className="h-14" />
            )}
            <p className="font-bold underline">{camatName}</p>
            <p>Pangkat : Pembina</p>
            <p>Nip. {camatNip}</p>
            {camatSig && camatTime ? (
              <p className="mt-1 text-[11px]">Ditandatangani secara elektronik pada {camatTime} (dummy, browser ini).</p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
