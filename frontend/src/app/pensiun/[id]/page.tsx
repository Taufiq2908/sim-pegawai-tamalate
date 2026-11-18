"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RequirePerm } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import { toast } from "@/components/toast";
import type { PensionBatch, PensionItem } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge, ProcessTrail, TrailEntry } from "@/components/ui";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
function periodLabel(y: number, m?: number | null): string {
  return m ? `${MONTHS[m - 1]} ${y}` : `Tahun ${y}`;
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  VERIFIED: "Terverifikasi",
  REVISION: "Perlu revisi",
  REJECTED: "Ditolak",
};

// Dokumen yang diminta untuk demo. Jenis lama tetap tersimpan di database,
// tetapi tidak ditampilkan dan tidak perlu diunggah lagi.
const REQUIRED_DOCS = [
  { code: "DPCP", label: "DPCP", hint: "Data Perorangan Calon Penerima Pensiun" },
  { code: "SK_PNS", label: "SK PNS", hint: "SK pengangkatan PNS" },
  { code: "SK_PANGKAT_TERAKHIR", label: "SK Pangkat Terakhir", hint: "SK kenaikan pangkat terakhir" },
  { code: "SK_JABATAN_TERAKHIR", label: "SK Jabatan Terakhir", hint: "SK jabatan terakhir" },
] as const;

type RequiredDocCode = (typeof REQUIRED_DOCS)[number]["code"];
type UploadSelection = Partial<Record<RequiredDocCode, File>>;

function inferDocCode(name: string): RequiredDocCode | null {
  const n = name.toLowerCase();
  if (n.includes("dpcp")) return "DPCP";
  if (n.includes("jabatan")) return "SK_JABATAN_TERAKHIR";
  if (n.includes("pangkat")) return "SK_PANGKAT_TERAKHIR";
  // SK CPNS bukan lagi dokumen wajib; jangan sampai terdeteksi sebagai SK PNS.
  if (n.includes("cpns")) return null;
  if (/(^|[^a-z])pns([^a-z]|$)/.test(n) || n.includes("skpns")) return "SK_PNS";
  return null;
}

function isLegacyDocName(name: string): boolean {
  const n = name.toLowerCase();
  return /\b(cpns|ktp|kk|npwp|rekening|pas\s*foto|skp|sehat|pernyataan)\b/.test(n);
}

function uploadedDoc(item: PensionItem, code: string) {
  return item.documents.find((d) => d.docType === code) ?? null;
}

function selectedFileCount(selection?: UploadSelection): number {
  return Object.values(selection ?? {}).filter(Boolean).length;
}

const ACTION_LABEL: Record<string, string> = {
  verify: "Verifikasi dokumen",
  revise: "Kembalikan untuk revisi",
  reject: "Tolak",
  paraf: "Paraf & teruskan ke Camat",
  approve: "Setujui & tandatangani",
  register: "Register & catat ke Buku Agenda Surat Keluar",
  expedite: "Catat Ekspedisi & Serahkan ke Caraka",
  send: "Catat bukti terima BKPSDMD",
  complete: "Selesaikan",
  archive: "Arsipkan",
};

const EXPEDITION_LABEL: Record<string, string> = {
  BELUM_DICATAT: "Belum dicatat di buku ekspedisi",
  BELUM_DIKIRIM: "Belum diserahkan ke caraka",
  DIKIRIM: "Sudah diserahkan, menunggu bukti terima",
  DITERIMA: "Sudah diterima BKPSDMD",
};

const EXPEDITION_CLASS: Record<string, string> = {
  BELUM_DICATAT: "bg-paper text-muted ring-line",
  BELUM_DIKIRIM: "bg-warn-100 text-warn-700 ring-warn-700/30",
  DIKIRIM: "bg-info-100 text-info-700 ring-info-700/30",
  DITERIMA: "bg-ok-100 text-ok-700 ring-ok-700/30",
};

const NOTE_REQUIRED = ["revise", "reject"];

const WAITING_HINT: Record<string, string> = {
  DRAFT: "Draf belum diajukan. Unggah dokumen lalu verifikasi.",
  VERIFIED: "Menunggu Sekcam memeriksa dan memaraf draf usulan.",
  PARAF: "Menunggu Camat memvalidasi dan menandatangani surat pengusulan.",
  APPROVED: "Menunggu staf kepegawaian mencatat surat ke Buku Agenda Surat Keluar.",
  REGISTERED: "Menunggu pencatatan serah terima ke caraka di Buku Ekspedisi Surat Keluar.",
  EXPEDITED: "Menunggu pendistribusi/operator mencatat bukti terima dari BKPSDMD.",
  SENT: "Bukti terima sudah dicatat. Tahap penutupan/arsip bersifat opsional.",
  COMPLETED: "Usulan sudah selesai dan dapat diarsipkan.",
  ARCHIVED: "Usulan sudah diarsipkan.",
  REJECTED: "Usulan ditolak; tidak ada aksi lanjutan.",
  REVISION: "Berkas dikembalikan untuk diperbaiki staf kepegawaian.",
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PensiunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("pension.document.upload");
  const canViewOutgoing = hasPermission("outgoing.view");

  const [batch, setBatch] = useState<PensionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [uploadSelections, setUploadSelections] = useState<Record<string, UploadSelection>>({});
  const [uploadEpoch, setUploadEpoch] = useState(0);
  const [uploading, setUploading] = useState<{ itemId: string; done: number; total: number } | null>(null);
  const [note, setNote] = useState("");
  const [letterDate, setLetterDate] = useState(todayYmd());
  const [expeditionDate, setExpeditionDate] = useState(todayYmd());
  const [courierName, setCourierName] = useState("");
  const [receivedByName, setReceivedByName] = useState("BKPSDMD Kota Makassar");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayYmd());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<PensionBatch>(`/pension-requests/${id}`);
      setBatch(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail usulan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <div className="mt-4"><Skeleton className="h-64 w-full" /></div>
      </RequirePerm>
    );
  }
  if (error) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <ErrorBox message={error} onRetry={load} />
      </RequirePerm>
    );
  }
  if (!batch) {
    return (
      <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
        <EmptyState title="Usulan pensiun tidak ditemukan" />
      </RequirePerm>
    );
  }

  const statusIndex = ["DRAFT","VERIFIED","PARAF","APPROVED","REGISTERED","EXPEDITED","SENT","COMPLETED"].indexOf(batch.status);
  const currentStep = statusIndex >= 0 ? statusIndex : 0;

  const trail: TrailEntry[] = (batch.timeline ?? []).map((t) => ({
    title: t.action,
    subtitle: t.note ?? undefined,
    time: t.createdAt,
    state:
      t.toStatus === batch.status
        ? "now"
        : ["DRAFT","VERIFIED","PARAF","APPROVED","REGISTERED","EXPEDITED","SENT","COMPLETED"].indexOf(t.fromStatus) < currentStep
          ? "done"
          : "todo",
  }));

  const isDraftOrRevision = batch.status === "DRAFT" || batch.status === "REVISION";
  const actions = batch.availableActions ?? [];
  const outgoing = batch.outgoingLetter ?? null;
  const expedition = outgoing?.outgoingExpedition ?? null;
  const expeditionStatus = batch.expeditionStatus ?? expedition?.status ?? "BELUM_DICATAT";
  const showExpeditionCard = Boolean(outgoing)
    || ["APPROVED", "REGISTERED", "EXPEDITED", "SENT", "COMPLETED", "ARCHIVED"].includes(batch.status);

  function setSelectedFile(itemId: string, code: RequiredDocCode, file: File | null) {
    if (file && file.size > 5 * 1024 * 1024) {
      toast.error(`${file.name} lebih dari 5MB.`);
      setUploadEpoch((n) => n + 1);
      return;
    }
    setUploadSelections((prev) => {
      const next = { ...(prev[itemId] ?? {}) };
      if (file) next[code] = file;
      else delete next[code];
      return { ...prev, [itemId]: next };
    });
  }

  function clearSelection(itemId: string, code: RequiredDocCode) {
    setSelectedFile(itemId, code, null);
    setUploadEpoch((n) => n + 1);
  }

  function handleBulkSelect(itemId: string, files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const next = { ...(uploadSelections[itemId] ?? {}) };
    const codes = REQUIRED_DOCS.map((d) => d.code);
    let added = 0;
    for (const file of list) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} lebih dari 5MB dan dilewati.`);
        continue;
      }
      if (isLegacyDocName(file.name)) {
        toast.error(`${file.name}: dokumen ini tidak lagi diminta untuk demo.`);
        continue;
      }
      const inferred = inferDocCode(file.name);
      const code =
        (inferred && !next[inferred] ? inferred : codes.find((c) => !next[c])) ?? null;
      if (!code) {
        toast.error("Maksimal 4 berkas untuk empat dokumen wajib.");
        break;
      }
      next[code] = file;
      added += 1;
    }
    if (added > 0) setUploadSelections((prev) => ({ ...prev, [itemId]: next }));
    setUploadEpoch((n) => n + 1);
  }

  async function uploadDocuments(itemId: string) {
    const selection = uploadSelections[itemId] ?? {};
    const entries = Object.entries(selection).filter(([, file]) => Boolean(file)) as Array<
      [RequiredDocCode, File]
    >;
    if (entries.length === 0) {
      toast.error("Pilih minimal satu berkas terlebih dahulu.");
      return;
    }

    setUploading({ itemId, done: 0, total: entries.length });
    const failed: UploadSelection = {};
    let failedCount = 0;
    let lastError = "";

    for (const [code, file] of entries) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", code);
      try {
        await apiUpload(`/pension-requests/${id}/items/${itemId}/documents`, fd);
      } catch (err) {
        failed[code] = file;
        failedCount += 1;
        lastError = err instanceof Error ? err.message : "Unggah gagal";
      } finally {
        setUploading((prev) =>
          prev && prev.itemId === itemId ? { ...prev, done: prev.done + 1 } : prev,
        );
      }
    }

    setUploading(null);
    setUploadEpoch((n) => n + 1);
    setUploadSelections((prev) => ({ ...prev, [itemId]: failed }));
    await load();

    if (failedCount > 0) {
      toast.error(
        `${entries.length - failedCount} berhasil, ${failedCount} gagal: ${lastError}`,
      );
    } else {
      toast.success(`${entries.length} berkas berhasil diunggah sekaligus.`);
    }
  }

  async function deleteDocument(itemId: string, docId: string) {
    if (!confirm("Hapus dokumen ini?")) return;
    setActing("delete");
    try {
      await apiFetch(`/pension-requests/${id}/items/${itemId}/documents/${docId}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hapus gagal");
    } finally {
      setActing(null);
    }
  }

  async function runAction(action: string, body: unknown) {
    setActing(action);
    try {
      await apiFetch(`/pension-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNote("");
      toast.success("Aksi berhasil diproses.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Aksi ${action} gagal`);
    } finally {
      setActing(null);
    }
  }

  async function act(action: string) {
    const trimmedNote = note.trim();
    if (NOTE_REQUIRED.includes(action) && trimmedNote.length < 5) {
      toast.error("Catatan minimal 5 karakter untuk revisi/penolakan.");
      return;
    }
    if (action === "register") {
      if (!letterDate) {
        toast.error("Tanggal surat keluar wajib diisi.");
        return;
      }
      await runAction(action, {
        createOutgoingLetter: true,
        outgoingLetterDate: letterDate,
        classificationCode: "800.1.6.6",
        note: trimmedNote || "Dicatat di Buku Agenda Surat Keluar",
      });
      return;
    }
    if (action === "expedite") {
      if (!courierName.trim()) {
        toast.error("Nama pendistribusi/caraka wajib diisi.");
        return;
      }
      if (!expeditionDate) {
        toast.error("Tanggal ekspedisi wajib diisi.");
        return;
      }
      await runAction(action, {
        expeditionDate,
        courierName: courierName.trim(),
        note: trimmedNote || undefined,
      });
      return;
    }
    if (action === "send") {
      if (!receiptNumber.trim()) {
        toast.error("Nomor tanda terima wajib diisi.");
        return;
      }
      if (!receiptDate) {
        toast.error("Tanggal tanda terima wajib diisi.");
        return;
      }
      await runAction(action, {
        receiptNumber: receiptNumber.trim(),
        receiptDate,
        receivedByName: receivedByName.trim() || "BKPSDMD Kota Makassar",
        note: trimmedNote || undefined,
      });
      return;
    }
    await runAction(action, {
      ...(action === "verify" ? { documentsComplete: true } : {}),
      note: trimmedNote || undefined,
    });
  }

  return (
    <RequirePerm perm="pension.view" label="Detail Usulan Pensiun">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-4 space-y-4">
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">{batch.batchNumber}</h1>
              <p className="text-sm text-muted">
                {batch.statusLabel} • {batch.items?.length ?? 0} PNS
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={batch.status} label={batch.statusLabel} />
            </div>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Nomor Usulan</dt><dd className="font-medium">{batch.batchNumber}</dd></div>
            <div><dt className="text-muted">Periode</dt><dd className="font-medium">{periodLabel(batch.periodYear, batch.periodMonth)}</dd></div>
            <div><dt className="text-muted">Usia BUP</dt><dd className="font-medium">{batch.bupAge} tahun</dd></div>
            <div><dt className="text-muted">Status</dt><dd className="font-medium"><StatusBadge status={batch.status} label={batch.statusLabel} /></dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">Catatan</dt><dd className="font-medium">{batch.note ?? "-"}</dd></div>
            {batch.outgoingLetterNumber && (
              <div><dt className="text-muted">Nomor Surat</dt><dd className="font-medium">{batch.outgoingLetterNumber}</dd></div>
            )}
            {batch.agendaNumber && (
              <div><dt className="text-muted">Nomor Agenda</dt><dd className="font-medium">{batch.agendaNumber}</dd></div>
            )}
            {batch.expeditionNumber && (
              <div><dt className="text-muted">No. Registrasi Ekspedisi</dt><dd className="font-medium">{batch.expeditionNumber}</dd></div>
            )}
            {batch.receiptNumber && (
              <div><dt className="text-muted">Nomor Tanda Terima</dt><dd className="font-medium">{batch.receiptNumber}</dd></div>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 print:hidden">
            <a
              href={`/pensiun/${batch.id}/cetak/nominatif`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
            >
              Cetak daftar nominatif
            </a>
            <a
              href={`/pensiun/${batch.id}/cetak/surat`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Cetak surat usulan
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Aksi &amp; tahapan</h2>
              <p className="mt-0.5 text-sm text-muted">
                Tombol di bawah mengikuti status dan hak akses Anda. Register membuat surat keluar
                resmi sekaligus menyiapkan baris Buku Ekspedisi Surat Keluar.
              </p>
            </div>
          </div>

          {actions.length === 0 ? (
            <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted">
              {WAITING_HINT[batch.status] ?? "Tidak ada aksi tersedia untuk Anda."}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button
                    key={a}
                    disabled={acting !== null}
                    onClick={() => void act(a)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                      a === "reject" ? "bg-bad-700 hover:brightness-110" : "bg-brand-900 hover:bg-brand-800"
                    }`}
                  >
                    {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                  </button>
                ))}
              </div>

              {actions.includes("register") ? (
                <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                  <label className="text-xs font-medium text-muted">
                    Tanggal surat keluar
                    <input
                      type="date"
                      value={letterDate}
                      onChange={(e) => setLetterDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700 sm:w-56"
                    />
                  </label>
                  <p className="mt-1 text-xs text-muted">
                    Nomor surat dibuat otomatis dengan klasifikasi 800.1.6.6. Surat langsung
                    masuk Buku Agenda Surat Keluar dan baris ekspedisinya disiapkan untuk langkah
                    berikutnya.
                  </p>
                </div>
              ) : null}

              {actions.includes("expedite") ? (
                <div className="mt-3 grid gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted">
                    Tanggal diserahkan ke caraka
                    <input
                      type="date"
                      value={expeditionDate}
                      onChange={(e) => setExpeditionDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Nama pendistribusi / caraka
                    <input
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      placeholder="mis. Petugas Ekspedisi Kecamatan"
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                    />
                  </label>
                  <p className="text-xs text-muted sm:col-span-2">
                    Aksi ini mengisi Buku Ekspedisi Surat Keluar. Bukti terima BKPSDMD dicatat
                    pada langkah berikutnya.
                  </p>
                </div>
              ) : null}

              {actions.includes("send") ? (
                <div className="mt-3 grid gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted">
                    Nomor tanda terima
                    <input
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      placeholder="mis. 123/BKPSDMD/XI/2026"
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Tanggal tanda terima
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted sm:col-span-2">
                    Nama penerima bukti terima
                    <input
                      value={receivedByName}
                      onChange={(e) => setReceivedByName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                    />
                  </label>
                  <p className="text-xs text-muted sm:col-span-2">
                    Setelah disimpan, Buku Ekspedisi Surat Keluar menandai surat sudah diterima
                    BKPSDMD.
                  </p>
                </div>
              ) : null}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  NOTE_REQUIRED.some((a) => actions.includes(a))
                    ? "Catatan (wajib untuk revisi/penolakan, minimal 5 karakter)"
                    : "Catatan (opsional)"
                }
                rows={2}
                className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
              />

              {actions.includes("verify") ? (
                <p className="mt-1 text-xs text-muted">
                  Verifikasi menandai dokumen lengkap dan meneruskan berkas ke Sekcam.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Proses Usulan</h2>
          <ProcessTrail items={trail} />
        </div>

        {showExpeditionCard ? (
          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">Surat pengantar &amp; Buku Ekspedisi Surat Keluar</h2>
                <p className="mt-1 text-sm text-muted">
                  Kartu ini menjalankan langkah 6–8 SOP. Buku Agenda Surat Keluar mencatat
                  nomor dan stempel surat; Buku Ekspedisi Surat Keluar mencatat serah terima
                  kepada caraka, lalu bukti terima dari BKPSDMD.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                  EXPEDITION_CLASS[expeditionStatus] ?? EXPEDITION_CLASS.BELUM_DICATAT
                }`}
              >
                {EXPEDITION_LABEL[expeditionStatus] ?? expeditionStatus}
              </span>
            </div>

            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor surat keluar</p>
                {outgoing ? (
                  <Link
                    href={`/surat-keluar/${outgoing.id}`}
                    className="mt-0.5 inline-block font-semibold text-brand-800 hover:underline"
                  >
                    {outgoing.letterNumber}
                  </Link>
                ) : (
                  <p className="mt-0.5 text-muted">Belum dibuat — gunakan aksi Register.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor agenda</p>
                <p className="mt-0.5 font-medium">{batch.agendaNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">No. registrasi ekspedisi</p>
                <p className="mt-0.5 font-medium">{expedition?.regNumber ?? batch.expeditionNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Tujuan</p>
                <p className="mt-0.5 font-medium">
                  {expedition?.recipientName ?? outgoing?.recipient ?? "BKPSDMD Kota Makassar"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Diserahkan ke caraka</p>
                <p className="mt-0.5 font-medium">
                  {expedition?.sentDate ?? batch.expeditionDate ?? "—"}
                  {expedition?.courierName ?? batch.courierName
                    ? ` • ${expedition?.courierName ?? batch.courierName}`
                    : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Diterima BKPSDMD</p>
                <p className="mt-0.5 font-medium">
                  {expedition?.receivedDate ?? batch.receiptDate ?? "—"}
                  {expedition?.receivedByName ?? batch.receivedBy
                    ? ` • ${expedition?.receivedByName ?? batch.receivedBy}`
                    : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor tanda terima</p>
                <p className="mt-0.5 font-medium">
                  {expedition?.receiptNumber ?? batch.receiptNumber ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Penandatangan</p>
                <p className="mt-0.5 font-medium">{outgoing?.signerName ?? batch.signers.camat?.name ?? "—"}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {outgoing && canViewOutgoing ? (
                <Link
                  href={`/surat-keluar/${outgoing.id}`}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                >
                  Buka detail surat keluar
                </Link>
              ) : null}
              <Link
                href="/pensiun/register"
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
              >
                Buku Register Pensiun
              </Link>
              <Link
                href="/pensiun/ekspedisi"
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
              >
                Buku Ekspedisi Pensiun
              </Link>
              {canViewOutgoing ? (
                <>
                  <Link
                    href="/surat-keluar/agenda"
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                  >
                    Buku Agenda Surat Keluar
                  </Link>
                  <Link
                    href="/surat-keluar/ekspedisi"
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                  >
                    Buku Ekspedisi Surat Keluar
                  </Link>
                </>
              ) : null}
            </div>

            {expeditionStatus === "DITERIMA" ? (
              <div className="mt-3 rounded-lg border border-ok-700/30 bg-ok-100 px-3 py-2 text-sm text-secondary">
                Bukti terima BKPSDMD sudah dicatat. Buku Ekspedisi Surat Keluar menandai surat ini
                sebagai <b>diterima tujuan</b>.
              </div>
            ) : expeditionStatus === "BELUM_DIKIRIM" ? (
              <div className="mt-3 rounded-lg border border-warn-700/30 bg-warn-100 px-3 py-2 text-sm text-secondary">
                Surat sudah tercatat di Buku Agenda Surat Keluar. Gunakan aksi{" "}
                <b>Catat Ekspedisi &amp; Serahkan ke Caraka</b> saat surat diserahkan.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Daftar PNS ({batch.items?.length ?? 0})</h2>
          {batch.items.length === 0 ? (
            <p className="text-sm text-muted">Belum ada PNS dalam usulan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-paper text-xs text-muted">
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">NIP</th>
                    <th className="px-3 py-2">Golongan</th>
                    <th className="px-3 py-2">Jabatan</th>
                    <th className="px-3 py-2">Tgl. Pensiun</th>
                    <th className="px-3 py-2">Masa Kerja</th>
                    <th className="px-3 py-2">Status Item</th>
                    <th className="px-3 py-2">Dokumen</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.items.map((item) => (
                    <Fragment key={item.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.employeeName}</td>
                        <td className="px-3 py-2">{item.employeeNip ?? "-"}</td>
                        <td className="px-3 py-2">{item.rank ?? "-"}</td>
                        <td className="px-3 py-2">{item.position}</td>
                        <td className="px-3 py-2">{item.retirementDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{item.yearsOfService ?? "-"} th</td>
                        <td className="px-3 py-2">
                          <span className={`rounded bg-paper px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line ${item.status === "VERIFIED" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
                            {ITEM_STATUS_LABEL[item.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.documentsChecklist.filter((c) => c.uploaded).length} / {item.documentsChecklist.length}
                          {item.missingDocuments.length > 0 ? (
                            <span className="ml-1 text-xs text-bad-700">({item.missingDocuments.length} kurang)</span>
                          ) : null}
                        </td>
                      </tr>
                      <tr className="border-b last:border-0 bg-slate-50">
                        <td colSpan={8} className="px-3 py-3">
                          <div className="rounded-lg border border-line bg-surface p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  Dokumen persyaratan
                                </p>
                                <p className="text-xs text-muted">
                                  Cukup 4 berkas inti. Pilih beberapa berkas sekaligus, lalu unggah
                                  sekali.
                                </p>
                              </div>
                              <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line">
                                {REQUIRED_DOCS.filter((d) => uploadedDoc(item, d.code)).length} / 4
                                terunggah
                              </span>
                            </div>

                            {canUpload && isDraftOrRevision ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-white px-3 py-1.5 text-xs font-semibold hover:border-brand-700">
                                  <span className="rounded bg-brand-900 px-2 py-1 text-white">
                                    Pilih beberapa berkas
                                  </span>
                                  <span className="text-muted">atau pilih per dokumen</span>
                                  <input
                                    key={`bulk-${item.id}-${uploadEpoch}`}
                                    type="file"
                                    multiple
                                    className="sr-only"
                                    onChange={(e) => handleBulkSelect(item.id, e.target.files)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={
                                    acting !== null ||
                                    uploading !== null ||
                                    selectedFileCount(uploadSelections[item.id]) === 0
                                  }
                                  onClick={() => void uploadDocuments(item.id)}
                                  className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                                >
                                  {uploading && uploading.itemId === item.id
                                    ? `Mengunggah ${uploading.done}/${uploading.total}…`
                                    : `Unggah semua (${selectedFileCount(uploadSelections[item.id])})`}
                                </button>
                                {selectedFileCount(uploadSelections[item.id]) > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadSelections((prev) => ({ ...prev, [item.id]: {} }));
                                      setUploadEpoch((n) => n + 1);
                                    }}
                                    className="text-xs font-semibold text-muted hover:text-bad-700"
                                  >
                                    Bersihkan pilihan
                                  </button>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              {REQUIRED_DOCS.map((doc) => {
                                const uploaded = uploadedDoc(item, doc.code);
                                const selected = uploadSelections[item.id]?.[doc.code];
                                return (
                                  <div
                                    key={doc.code}
                                    className="rounded-lg border border-line bg-paper p-2.5"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold">{doc.label}</p>
                                        <p className="text-[10px] text-muted">{doc.hint}</p>
                                      </div>
                                      <span
                                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                                          selected
                                            ? "bg-info-100 text-info-700 ring-info-700/30"
                                            : uploaded
                                              ? "bg-ok-100 text-ok-700 ring-ok-700/30"
                                              : "bg-bad-50 text-bad-700 ring-bad-700/30"
                                        }`}
                                      >
                                        {selected ? "Siap diunggah" : uploaded ? "Terunggah" : "Belum"}
                                      </span>
                                    </div>

                                    {uploaded ? (
                                      <div className="mt-2 flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px]">
                                        <a
                                          href={fileUrl(uploaded.downloadUrl)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="min-w-0 flex-1 truncate text-brand-900 hover:underline"
                                        >
                                          {uploaded.originalName}
                                        </a>
                                        {canUpload && isDraftOrRevision ? (
                                          <button
                                            type="button"
                                            onClick={() => void deleteDocument(item.id, uploaded.id)}
                                            className="shrink-0 rounded p-0.5 text-bad-700 hover:bg-bad-50"
                                            title="Hapus dokumen"
                                          >
                                            ×
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}

                                    {canUpload && isDraftOrRevision ? (
                                      <div className="mt-2">
                                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold hover:bg-paper">
                                          {uploaded ? "Ganti berkas" : "Pilih berkas"}
                                          <input
                                            key={`${item.id}-${doc.code}-${uploadEpoch}`}
                                            type="file"
                                            className="sr-only"
                                            onChange={(e) =>
                                              setSelectedFile(
                                                item.id,
                                                doc.code,
                                                e.target.files?.[0] ?? null,
                                              )
                                            }
                                          />
                                        </label>
                                        {selected ? (
                                          <p className="mt-1 flex items-center gap-1 text-[11px] text-brand-800">
                                            <span className="min-w-0 flex-1 truncate">
                                              {selected.name}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => clearSelection(item.id, doc.code)}
                                              className="shrink-0 text-muted hover:text-bad-700"
                                            >
                                              Batal
                                            </button>
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>

                            {item.missingDocuments.length > 0 ? (
                              <p className="mt-2 text-[11px] font-medium text-bad-700">
                                Kurang: {item.missingDocuments.join(", ")}
                              </p>
                            ) : (
                              <p className="mt-2 text-[11px] font-medium text-ok-700">
                                Semua dokumen inti sudah lengkap.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Timeline</h2>
          {batch.timeline.length === 0 ? (
            <p className="text-sm text-muted">Belum ada catatan timeline.</p>
          ) : (
            <ul className="space-y-3">
              {batch.timeline.map((t) => (
                <li key={t.createdAt} className="border-b pb-2 last:border-0">
                  <p className="text-sm font-medium">{t.action}</p>
                  <p className="text-xs text-muted">
                    {t.fromStatus} → {t.toStatus} • {t.actorName ?? t.actorRole}{t.actorPosition ? ` (${t.actorPosition})` : ""}
                  </p>
                  {t.note ? <p className="text-xs text-muted mt-1">“{t.note}”</p> : null}
                  <p className="text-xs text-muted">{new Date(t.createdAt).toLocaleString("id-ID", { hour12: false })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold mb-3">Pejabat</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Camat</dt><dd className="font-medium">{batch.signers.camat?.name ?? "-"} ({batch.signers.camat?.position ?? "-"})</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{batch.signers.camat?.nip ?? "-"}</dd></div>
            <div><dt className="text-muted">Sekcam</dt><dd className="font-medium">{batch.signers.sekcam?.name ?? "-"} ({batch.signers.sekcam?.position ?? "-"})</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">NIP</dt><dd className="font-medium">{batch.signers.sekcam?.nip ?? "-"}</dd></div>
          </dl>
        </div>
      </div>
    </RequirePerm>
  );
}
