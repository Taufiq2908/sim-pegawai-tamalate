"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { FileButton } from "@/components/form";
import { SignaturePad } from "@/components/signature";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { actionErrorMessage, apiFetch, apiUpload } from "@/lib/api";
import { fileUrl } from "@/lib/file-url";
import type { KgbDetail } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";
import { ParafHistoryPanel } from "@/components/paraf-history";
import { formatRupiah } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  verify: "Verifikasi",
  revise: "Minta revisi",
  paraf: "Paraf dan Teruskan",
  return: "Kembalikan dengan catatan",
  approve: "Setujui",
  reject: "Tolak",
  register: "Register & catat ke Buku Agenda Surat Keluar",
  tobkpsdm: "Catat Ekspedisi & Serahkan ke Caraka",
  complete: "Bukti terima BKD sudah diterima",
  archive: "Arsipkan",
};

const NOTE_REQUIRED = ["revise", "return", "reject"];

const EXPEDITION_LABEL: Record<string, string> = {
  BELUM_DICATAT: "Belum dicatat",
  BELUM_DIKIRIM: "Belum diserahkan ke caraka",
  DIKIRIM: "Sudah diserahkan, menunggu bukti terima",
  DITERIMA: "Sudah diterima BKD",
};

const KGB_REQUIRED_DOCS = ["SK_CPNS_TERAKHIR", "SK_PANGKAT_TERAKHIR", "SKP_2_TAHUN"];

const DOC_LABEL: Record<string, string> = {
  SK_CPNS_TERAKHIR: "SK KGB/CPNS terakhir",
  SK_PANGKAT_TERAKHIR: "SK kenaikan pangkat terakhir",
  SKP_2_TAHUN: "SKP 2 tahun terakhir",
  KP4: "KP4",
  KTP: "KTP",
  NPWP: "NPWP",
  REKENING_GAJI: "Rekening gaji",
  LAINNYA: "Dokumen lain",
};

const DOC_OPTIONS = Object.keys(DOC_LABEL);

export default function KgbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [detail, setDetail] = useState<KgbDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [docType, setDocType] = useState("SK_CPNS_TERAKHIR");
  const [file, setFile] = useState<File | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receivedByName, setReceivedByName] = useState("BKD Kota Makassar");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string) {
    if (action === "submit" && detail) {
      const have = new Set((detail.documents ?? []).map((d) => d.docType));
      const missing = KGB_REQUIRED_DOCS.filter((code) => !have.has(code));
      if (missing.length) {
        toast.error(
          `Lengkapi berkas wajib sebelum mengajukan: ${missing
            .map((code) => DOC_LABEL[code] ?? code)
            .join(", ")}.`,
        );
        return;
      }
    }
    if (NOTE_REQUIRED.includes(action) && !note.trim()) {
      toast.error("Catatan wajib diisi untuk aksi ini.");
      return;
    }
    setActing(action);
    try {
      const { data } = await apiFetch<KgbDetail>(`/kgb-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          note: note.trim() || undefined,
          ...(action === "complete"
            ? {
                receivedByName: receivedByName.trim() || "BKD Kota Makassar",
                receiptNumber: receiptNumber.trim() || undefined,
              }
            : {}),
        }),
      });
      setDetail(data);
      setNote("");
      setReceiptNumber("");
    } catch (err) {
      toast.error(actionErrorMessage(err, "Aksi gagal"));
    } finally {
      setActing(null);
    }
  }

  async function uploadDocument() {
    if (!file) {
      toast.error("Pilih berkas terlebih dahulu.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("file", file);
      await apiUpload(`/kgb-requests/${id}/documents`, fd);
      setFile(null);
      toast.success("Berkas KGB diunggah.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah berkas gagal");
    } finally {
      setActing(null);
    }
  }

  async function removeDraft() {
    if (!window.confirm("Hapus draf KGB ini beserta dokumennya?")) return;
    setActing("delete");
    try {
      await apiFetch(`/kgb-requests/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Draf KGB dihapus.");
      router.replace("/kgb");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus draf");
    } finally {
      setActing(null);
    }
  }

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employee?.id;
  const isDraftEditable = !!detail && ["DRAFT", "REVISION"].includes(detail.status);
  const canManageDraft =
    isDraftEditable &&
    (isOwner || (!!user && user.role !== "EMPLOYEE" && hasPermission("kgb.create")));
  const canUpload = canManageDraft && hasPermission("kgb.document.upload");
  const canDelete = !!detail && detail.status === "DRAFT" && (isOwner || user?.role === "SUPER_ADMIN");
  // Tombol sepenuhnya mengikuti availableActions backend (permission + jabatan + Plt).
  const visibleActions = detail?.availableActions ?? [];
  const showSignaturePanel =
    !!detail &&
    ((detail.status === "SUBMITTED" && visibleActions.includes("verify")) ||
      (detail.status === "PARAF" && visibleActions.includes("approve")));
  const camatApproval = detail?.parafHistory?.find((h) => h.action === "APPROVE");
  const approveTimeline = detail?.timeline?.find((t) => t.action === "APPROVE");
  const approvedByName = camatApproval?.actor?.name ?? approveTimeline?.actorName;
  const approvedByPosition = camatApproval?.actor?.position ?? approveTimeline?.actorPosition;

  return (
    <RequirePerm perm="kgb.view" label="KGB">
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            {detail.revisionNote ? (
              <div className="rounded-lg border border-warn-700/30 bg-warn-100 px-4 py-3">
                <p className="text-sm font-semibold text-warn-700">Perlu perbaikan</p>
                <p className="mt-0.5 text-sm text-secondary">{detail.revisionNote}</p>
                {canManageDraft ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={`/kgb/${detail.id}/edit`}
                      className="inline-block rounded-lg bg-warn-700 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                    >
                      Perbaiki data
                    </Link>
                    {canUpload ? (
                      <a
                        href="#dokumen-kgb"
                        className="inline-block rounded-lg border border-warn-700/30 bg-surface px-3 py-1.5 text-sm font-semibold text-warn-700 hover:bg-warn-100"
                      >
                        Unggah berkas
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.requestNumber}</h1>
                <StatusBadge
                  status={detail.status}
                  label={detail.status === "APPROVED" ? "Disetujui Camat" : undefined}
                />
                {canManageDraft ? (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Link
                      href={`/kgb/${detail.id}/edit`}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                    >
                      Edit data
                    </Link>
                    {canDelete ? (
                      <button
                        disabled={acting !== null}
                        onClick={() => void removeDraft()}
                        className="rounded-lg border border-bad-700/30 bg-surface px-3 py-1.5 text-sm font-medium text-bad-700 hover:bg-bad-100 disabled:opacity-50"
                      >
                        {acting === "delete" ? "…" : "Hapus draf"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Pegawai</dt><dd className="font-medium">{detail.employee?.name}</dd></div>
                <div><dt className="text-muted">TMT</dt><dd className="font-medium">{detail.effectiveDate?.slice(0, 10)}</dd></div>
                <div><dt className="text-muted">Golongan</dt><dd className="font-medium">{detail.oldRank} → {detail.newRank}</dd></div>
                <div><dt className="text-muted">Gaji</dt><dd className="font-medium">{formatRupiah(detail.oldSalary)} → {formatRupiah(detail.newSalary)}</dd></div>
                {detail.note ? <div className="sm:col-span-2"><dt className="text-muted">Catatan pengajuan</dt><dd className="font-medium">{detail.note}</dd></div> : null}
                {detail.rejectionReason ? <div><dt className="text-muted">Alasan penolakan</dt><dd className="font-medium text-bad-700">{detail.rejectionReason}</dd></div> : null}
                <div>
                  <dt className="text-muted">Sedang menunggu</dt>
                  <dd className="font-medium">{detail.waitingFor ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Versi dokumen</dt>
                  <dd className="font-medium tabular-nums">{detail.documentVersion ?? 1}</dd>
                </div>
              </dl>
            </div>

            {detail.approvedAt || detail.status === "APPROVED" ? (
              <div className="rounded-lg border border-ok-700/30 bg-ok-100 px-4 py-3">
                <p className="text-sm font-semibold text-ok-700">Disetujui Camat</p>
                <p className="mt-0.5 text-sm text-secondary">
                  {detail.approvedAt
                    ? new Date(detail.approvedAt).toLocaleString("id-ID", { hour12: false })
                    : "Waktu persetujuan tidak tercatat"}
                  {approvedByName ? ` • ${approvedByName}` : ""}
                  {approvedByPosition ? ` (${approvedByPosition})` : ""}
                </p>
                {detail.approvalNote ? (
                  <p className="mt-1 text-sm text-secondary">Catatan: {detail.approvalNote}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  Status ini berarti dokumen disetujui Camat. Integrasi TTE belum diaktifkan.
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Aksi persetujuan</h2>
              {detail.status === "VERIFIED" && visibleActions.includes("paraf") ? (
                <div className="mt-2 rounded-lg border border-info-700/30 bg-info-100 px-3 py-2 text-sm text-secondary">
                  Kasubag sudah memverifikasi. Klik <b>Paraf dan Teruskan</b> untuk meneruskan ke Camat.
                </div>
              ) : null}
              {detail.status === "PARAF" && visibleActions.includes("approve") ? (
                <div className="mt-2 rounded-lg border border-ok-700/30 bg-ok-100 px-3 py-2 text-sm text-secondary">
                  Sudah diparaf Sekcam. Camat dapat memilih <b>Setujui</b>,{" "}
                  <b>Kembalikan dengan catatan</b>, atau <b>Tolak</b>.
                </div>
              ) : null}
              {visibleActions.length ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visibleActions.map((a) => (
                      <button
                        key={a}
                        disabled={acting !== null}
                        onClick={() => void act(a)}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                          a === "reject" ? "bg-bad-700 hover:brightness-110" : "bg-brand-900 hover:bg-brand-800"
                        }`}
                      >
                        {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                      </button>
                    ))}
                  </div>
                  {showSignaturePanel && user ? (
                    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                      <p className="text-sm font-semibold">Tanda tangan untuk pratinjau surat (opsional)</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Bukan TTE dan tidak disimpan di server. Aksi persetujuan tetap diproses tanpa
                        menggambar tanda tangan.
                      </p>
                      <div className="mt-2">
                        <SignaturePad username={user.username} />
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      NOTE_REQUIRED.some((a) => visibleActions.includes(a))
                        ? "Catatan (wajib untuk revisi/kembalikan/tolak)"
                        : visibleActions.includes("register")
                          ? "Catatan register (opsional). Nomor surat keluar dibuat otomatis."
                          : visibleActions.includes("tobkpsdm")
                            ? "Catatan ekspedisi (opsional), mis. nama caraka."
                            : visibleActions.includes("complete")
                              ? "Catatan bukti terima (opsional)."
                              : "Catatan (opsional)"
                    }
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  {visibleActions.includes("register") ? (
                    <p className="mt-1 text-xs text-muted">
                      Register membuat nomor surat keluar otomatis, mencatatnya di Buku Agenda
                      Surat Keluar, dan menyiapkan baris Buku Ekspedisi Surat Keluar.
                    </p>
                  ) : null}
                  {visibleActions.includes("tobkpsdm") ? (
                    <p className="mt-1 text-xs text-muted">
                      Aksi ini mencatat penyerahan surat ke caraka/pengekspedisi. Setelah surat
                      diserahkan ke BKD, gunakan aksi bukti terima.
                    </p>
                  ) : null}
                  {visibleActions.includes("complete") ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-medium text-muted">
                        Nama penerima bukti
                        <input
                          value={receivedByName}
                          onChange={(e) => setReceivedByName(e.target.value)}
                          placeholder="BKD Kota Makassar"
                          className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Nomor tanda terima (opsional)
                        <input
                          value={receiptNumber}
                          onChange={(e) => setReceiptNumber(e.target.value)}
                          placeholder="mis. 123/BKD/XI/2026"
                          className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm font-normal text-ink outline-none focus:border-brand-700"
                        />
                      </label>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Tidak ada aksi tersedia untuk Anda.</p>
              )}
            </div>

            {["APPROVED", "REGISTERED", "SUBMITTED_BKPSDMD", "COMPLETED", "ARCHIVED"].includes(detail.status) ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Surat pengantar &amp; ekspedisi</h2>
                <p className="mt-1 text-sm text-muted">
                  Register membuat surat keluar resmi di Buku Agenda Surat Keluar. Setelah surat
                  diserahkan ke caraka, catat ekspedisinya; setelah bukti terima BKD diterima,
                  tandai bukti terima pada aksi di atas.
                </p>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor surat keluar</p>
                    {detail.outgoingLetter ? (
                      <Link
                        href={`/surat-keluar/${detail.outgoingLetter.id}`}
                        className="mt-0.5 inline-block font-semibold text-brand-800 hover:underline"
                      >
                        {detail.outgoingLetter.letterNumber}
                      </Link>
                    ) : (
                      <p className="mt-0.5 text-muted">Belum dibuat — gunakan aksi Register.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Status ekspedisi</p>
                    <p className="mt-0.5 font-medium">
                      {EXPEDITION_LABEL[detail.expeditionStatus ?? "BELUM_DICATAT"] ?? detail.expeditionStatus}
                    </p>
                  </div>
                  {detail.outgoingLetter?.outgoingExpedition?.regNumber ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">No. registrasi ekspedisi</p>
                      <p className="mt-0.5 font-medium">{detail.outgoingLetter.outgoingExpedition.regNumber}</p>
                    </div>
                  ) : null}
                  {detail.outgoingLetter?.outgoingExpedition?.sentDate ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Tanggal diserahkan</p>
                      <p className="mt-0.5 font-medium">{detail.outgoingLetter.outgoingExpedition.sentDate}</p>
                    </div>
                  ) : null}
                  {detail.outgoingLetter?.outgoingExpedition?.receivedDate ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Diterima BKD</p>
                      <p className="mt-0.5 font-medium">
                        {detail.outgoingLetter.outgoingExpedition.receivedDate}
                        {detail.outgoingLetter.outgoingExpedition.receivedByName
                          ? ` • ${detail.outgoingLetter.outgoingExpedition.receivedByName}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                  {detail.outgoingLetter?.outgoingExpedition?.receiptNumber ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor tanda terima</p>
                      <p className="mt-0.5 font-medium">{detail.outgoingLetter.outgoingExpedition.receiptNumber}</p>
                    </div>
                  ) : null}
                  {detail.outgoingLetter?.archiveRecord ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Nomor arsip</p>
                      <Link
                        href={`/arsip/${detail.outgoingLetter.archiveRecord.id}`}
                        className="mt-0.5 inline-block font-semibold text-brand-800 hover:underline"
                      >
                        {detail.outgoingLetter.archiveRecord.archiveNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {detail.outgoingLetter.archiveRecord.listId
                          ? "Sudah masuk Daftar Arsip"
                          : "Belum masuk Daftar Arsip"}
                      </p>
                    </div>
                  ) : null}
                </div>
                {detail.outgoingLetter && !detail.outgoingLetter.archiveRecord && ["COMPLETED", "ARCHIVED"].includes(detail.status) ? (
                  <p className="mt-3 rounded-lg border border-warn-700/25 bg-warn-100 px-3 py-2 text-xs text-ink">
                    Surat pengantar menunggu persetujuan arsip Sekcam/Camat.
                    {hasPermission("archive.view") ? (
                      <>
                        {" "}
                        <Link href="/arsip?tab=antrean" className="font-semibold text-brand-800 hover:underline">
                          Buka antrean arsip
                        </Link>
                        .
                      </>
                    ) : null}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/kgb/${detail.id}/surat`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                  >
                    Buka surat pengantar (cetak)
                  </a>
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
                  {detail.outgoingLetter?.archiveRecord ? (
                    <Link
                      href="/arsip"
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                    >
                      Buku Arsip
                    </Link>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Penandatangan: {detail.outgoingLetter?.signerName ?? detail.camat?.name ?? "................"}
                  {detail.camat?.nip ? ` • NIP ${detail.camat.nip}` : ""}
                </p>
              </div>
            ) : null}

            <div id="dokumen-kgb" className="scroll-mt-4 rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-semibold">{d.originalName}</span>
                    <span className="text-xs text-muted">({DOC_LABEL[d.docType] ?? d.docType})</span>
                    <a
                      href={fileUrl(d.downloadUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto rounded-lg bg-brand-900 px-3 py-1 text-xs font-bold text-white hover:brightness-110"
                    >
                      Unduh
                    </a>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? <li className="text-muted">Belum ada dokumen.</li> : null}
              </ul>

              {canUpload ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm font-semibold">
                    {detail.status === "REVISION" ? "Unggah berkas perbaikan" : "Lengkapi berkas KGB"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Backend belum menyediakan hapus dokumen; unggah ulang berkas pengganti dengan jenis yang sama bila perlu.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto] print:block">
                    <FileButton
                      hint="PDF/JPG/PNG, maks 5MB"
                      onSelect={setFile}
                    />
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-700"
                    >
                      {DOC_OPTIONS.map((code) => (
                        <option key={code} value={code}>{DOC_LABEL[code]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => void uploadDocument()}
                      className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {acting === "upload" ? "Mengunggah…" : "Unggah"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <ParafHistoryPanel entries={detail.parafHistory} />

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Riwayat proses</h2>
              <ProcessTrail
                items={(detail.timeline ?? []).map((t, i, arr) => ({
                  title: `${t.action} — ${t.fromStatus} → ${t.toStatus}`,
                  subtitle: [t.actorName ?? t.actor, t.actorNip ? `NIP ${t.actorNip}` : null, t.actorPosition ?? null].filter(Boolean).join(" • "),
                  note: t.note,
                  time: new Date(t.createdAt).toLocaleString("id-ID", { hour12: false }),
                  state:
                    i < arr.length - 1 || ["COMPLETED", "REJECTED", "ARCHIVED"].includes(detail.status)
                      ? "done"
                      : "now",
                }))}
              />
            </div>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}
