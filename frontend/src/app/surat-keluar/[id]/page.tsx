"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/components/shell";
import { apiFetch, apiUpload } from "@/lib/api";
import { DocumentPreview } from "@/components/document-preview";
import { Field, FileButton } from "@/components/form";
import { toast } from "@/components/toast";
import { refreshNotificationBadge } from "@/lib/notification-refresh";
import type { OutgoingLetter } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

// Tanggal hari ini menurut WITA (UTC+8), sama dengan todayYMD backend.
const today = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SuratKeluarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<OutgoingLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [issueForm, setIssueForm] = useState({
    subject: "",
    recipient: "",
    letterDate: "",
    priority: "BIASA",
    secrecy: "B",
    signerName: "",
    letterCode: "",
    destinationNumber: "",
    personInCharge: "",
    remarks: "",
  });
  const [expeditionForm, setExpeditionForm] = useState({
    sentDate: today(),
    courierName: "",
    recipientName: "",
    note: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    receivedDate: today(),
    receivedByName: "BKD Kota Makassar",
    receiptNumber: "",
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}`);
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

  useEffect(() => {
    if (!detail) return;
    setIssueForm({
      subject: detail.subject.startsWith("(RESERVED)") ? "" : detail.subject,
      recipient: detail.recipient ?? "",
      letterDate: detail.letterDate?.slice(0, 10) ?? "",
      priority: detail.priority || "BIASA",
      secrecy: detail.secrecy || "B",
      signerName: detail.signerName ?? "",
      letterCode: detail.letterCode ?? "",
      destinationNumber: detail.destinationNumber ?? "",
      personInCharge: detail.personInCharge ?? "",
      remarks: detail.remarks ?? "",
    });
    setExpeditionForm((form) => ({
      ...form,
      recipientName: detail.outgoingExpedition?.recipientName ?? detail.recipient ?? "",
      courierName: detail.outgoingExpedition?.courierName ?? form.courierName,
      sentDate: detail.outgoingExpedition?.sentDate ?? form.sentDate,
    }));
  }, [detail?.id]);

  const setIssue =
    (key: keyof typeof issueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setIssueForm((form) => ({ ...form, [key]: e.target.value }));

  const setExpedition =
    (key: keyof typeof expeditionForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setExpeditionForm((form) => ({ ...form, [key]: e.target.value }));

  const setReceipt =
    (key: keyof typeof receiptForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setReceiptForm((form) => ({ ...form, [key]: e.target.value }));

  // Sumber kebenaran tombol aksi: availableActions dari backend.
  const actions = detail?.availableActions ?? [];
  const canIssue = actions.includes("issue");
  const canCancel = actions.includes("cancel");
  const canUpload = actions.includes("upload");
  const canResubmit = actions.includes("resubmit_archive");
  const canRecordExpedition = actions.includes("record_expedition") || actions.includes("mark_expedition_sent");
  const canMarkReceived = actions.includes("mark_expedition_received");

  async function issue() {
    if (!issueForm.recipient.trim()) {
      toast.error("Tujuan surat wajib diisi.");
      return;
    }
    if (!issueForm.letterDate) {
      toast.error("Tanggal surat wajib diisi.");
      return;
    }
    if (issueForm.letterDate > today()) {
      toast.error("Tanggal surat tidak boleh masa depan.");
      return;
    }
    setActing("issue");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}/issue`, {
        method: "POST",
        body: JSON.stringify({
          subject: issueForm.subject.trim() || undefined,
          recipient: issueForm.recipient.trim(),
          letterDate: issueForm.letterDate,
          priority: issueForm.priority,
          secrecy: issueForm.secrecy,
          signerName: issueForm.signerName,
          letterCode: issueForm.letterCode,
          destinationNumber: issueForm.destinationNumber,
          personInCharge: issueForm.personInCharge,
          remarks: issueForm.remarks,
        }),
      });
      setDetail(data);
      refreshNotificationBadge();
      toast.success("Reservasi diterbitkan dengan nomor tetap.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Penerbitan gagal");
    } finally {
      setActing(null);
    }
  }

  async function cancel() {
    if (cancelReason.trim().length < 5) {
      toast.error("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setActing("cancel");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setDetail(data);
      setCancelReason("");
      toast.success("Reservasi dibatalkan. Nomor tidak dipakai ulang.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pembatalan gagal");
    } finally {
      setActing(null);
    }
  }

  async function resubmit() {
    setActing("resubmit");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}/resubmit-archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDetail(data);
      refreshNotificationBadge();
      toast.success("Surat diajukan ulang ke antrean arsip.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pengajuan ulang gagal");
    } finally {
      setActing(null);
    }
  }

  async function upload() {
    if (!file) {
      toast.error("Pilih file terlebih dahulu.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File maksimal 10 MB.");
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      toast.error("File harus PDF, JPG, atau PNG.");
      return;
    }
    setActing("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/outgoing-letters/${id}/documents`, fd);
      setFile(null);
      await load();
      toast.success("Dokumen ditambahkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah gagal");
    } finally {
      setActing(null);
    }
  }

  async function saveExpedition() {
    if (!expeditionForm.recipientName.trim()) {
      toast.error("Nama penerima/instansi tujuan wajib diisi.");
      return;
    }
    setActing("expedition");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}/expedition`, {
        method: "POST",
        body: JSON.stringify({
          sentDate: expeditionForm.sentDate || undefined,
          courierName: expeditionForm.courierName.trim() || undefined,
          recipientName: expeditionForm.recipientName.trim(),
          note: expeditionForm.note.trim() || undefined,
        }),
      });
      setDetail(data);
      toast.success("Penyerahan ke caraka dicatat di Buku Ekspedisi Surat Keluar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat ekspedisi");
    } finally {
      setActing(null);
    }
  }

  async function saveReceipt() {
    if (!receiptForm.receivedByName.trim()) {
      toast.error("Nama penerima bukti terima wajib diisi.");
      return;
    }
    setActing("receipt");
    try {
      const { data } = await apiFetch<OutgoingLetter>(`/outgoing-letters/${id}/expedition/receipt`, {
        method: "POST",
        body: JSON.stringify({
          receivedDate: receiptForm.receivedDate || undefined,
          receivedByName: receiptForm.receivedByName.trim(),
          receiptNumber: receiptForm.receiptNumber.trim() || undefined,
          note: receiptForm.note.trim() || undefined,
        }),
      });
      setDetail(data);
      toast.success("Bukti terima dicatat. Surat sudah diterima instansi tujuan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat bukti terima");
    } finally {
      setActing(null);
    }
  }

  return (
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          ← Kembali
        </button>
        <Link href="/surat-keluar/agenda" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          Buku Agenda Surat Keluar
        </Link>
        <Link href="/surat-keluar/ekspedisi" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          Buku Ekspedisi Surat Keluar
        </Link>
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.letterNumber}</h1>
                <StatusBadge status={detail.status} />
                {detail.archiveRecord ? (
                  <span className="rounded-full bg-ok-100 px-2 py-0.5 text-xs font-semibold text-ok-700">
                    Diarsipkan ({detail.archiveRecord.archiveNumber})
                  </span>
                ) : null}
                <span className="text-xs text-muted">
                  {detail.priority} • {detail.secrecy}
                </span>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Perihal" value={detail.subject} />
                <Info label="Tujuan" value={detail.recipient ?? "—"} />
                <Info label="Tanggal surat" value={detail.letterDate?.slice(0, 10) ?? "—"} />
                <Info label="Penandatangan" value={detail.signerName ?? "—"} />
                <Info label="Kode surat" value={detail.letterCode ?? "—"} />
                <Info label="Nomor tujuan" value={detail.destinationNumber ?? "—"} />
                <Info label="Penanggung jawab" value={detail.personInCharge ?? "—"} />
                <Info label="Klasifikasi" value={detail.classification ? `${detail.classification.code} — ${detail.classification.name}` : "—"} />
                <Info label="Keterangan" value={detail.remarks ?? "—"} />
                <Info label="Dibuat" value={fmtDateTime(detail.createdAt)} />
                {detail.reservedAt ? <Info label="Dibooking" value={fmtDateTime(detail.reservedAt)} /> : null}
                {detail.issuedAt ? <Info label="Diterbitkan" value={fmtDateTime(detail.issuedAt)} /> : null}
              </div>
              {detail.reservationReason ? (
                <div className="mt-3 rounded-md bg-paper px-3 py-2 text-sm">
                  <span className="font-medium">Alasan booking: </span>
                  {detail.reservationReason}
                </div>
              ) : null}
              {detail.cancelReason ? (
                <div className="mt-3 rounded-md bg-bad-100 px-3 py-2 text-sm text-bad-700">
                  <span className="font-medium">Dibatalkan: </span>
                  {detail.cancelReason}
                </div>
              ) : null}
            </section>

            {detail.archiveRejectedAt ? (
              <section className="rounded-lg border border-bad-700/20 bg-bad-100/50 p-4">
                <h2 className="font-semibold text-bad-700">Arsip dikembalikan untuk revisi</h2>
                <p className="mt-1 text-sm">{detail.archiveRejectionNote || "Tidak ada catatan revisi."}</p>
                <p className="mt-1 text-xs text-muted">Dikembalikan {fmtDateTime(detail.archiveRejectedAt)}</p>
                {canResubmit ? (
                  <button
                    type="button"
                    disabled={acting !== null}
                    onClick={() => void resubmit()}
                    className="mt-2 rounded-lg bg-brand-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {acting === "resubmit" ? "Mengajukan…" : "Ajukan ulang ke antrean arsip"}
                  </button>
                ) : null}
              </section>
            ) : null}

            {canIssue || canCancel ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">{canIssue ? "Terbitkan reservasi" : "Batalkan reservasi"}</h2>
                {canIssue ? (
                  <>
                    <p className="mt-0.5 text-sm text-muted">
                      Nomor tetap. Tanggal boleh dikoreksi; backend menghitung ulang segmen tanggal tanpa mengubah urutan nomor.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Perihal*">
                        <input value={issueForm.subject} onChange={setIssue("subject")} placeholder="Isi perihal surat" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Tujuan*">
                        <input value={issueForm.recipient} onChange={setIssue("recipient")} placeholder="Instansi/pegawai tujuan" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Tanggal surat*">
                        <input type="date" max={today()} value={issueForm.letterDate} onChange={setIssue("letterDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Prioritas">
                        <select value={issueForm.priority} onChange={setIssue("priority")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                          <option value="BIASA">Biasa</option>
                          <option value="SEGERA">Segera</option>
                          <option value="SANGAT_SEGERA">Sangat segera</option>
                        </select>
                      </Field>
                      <Field label="Sifat">
                        <select value={issueForm.secrecy} onChange={setIssue("secrecy")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700">
                          <option value="B">Biasa</option>
                          <option value="R">Rahasia</option>
                          <option value="SR">Sangat rahasia</option>
                        </select>
                      </Field>
                      <Field label="Penandatangan">
                        <input value={issueForm.signerName} onChange={setIssue("signerName")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Kode surat">
                        <input value={issueForm.letterCode} onChange={setIssue("letterCode")} placeholder="cth: 800.1" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Nomor tujuan">
                        <input value={issueForm.destinationNumber} onChange={setIssue("destinationNumber")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Penanggung jawab">
                        <input value={issueForm.personInCharge} onChange={setIssue("personInCharge")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Keterangan">
                        <input value={issueForm.remarks} onChange={setIssue("remarks")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                    </div>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => void issue()}
                      className="mt-3 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      {acting === "issue" ? "Menerbitkan…" : "Terbitkan surat"}
                    </button>
                  </>
                ) : null}

                {canCancel ? (
                  <div className={canIssue ? "mt-4 border-t border-line pt-3" : "mt-3"}>
                    {canIssue ? <h3 className="text-sm font-semibold">Batalkan reservasi</h3> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Alasan pembatalan (min 5 karakter)*"
                        className="min-w-56 flex-1 rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700"
                      />
                      <button
                        type="button"
                        disabled={acting !== null}
                        onClick={() => void cancel()}
                        className="rounded-lg bg-bad-700 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                      >
                        {acting === "cancel" ? "Membatalkan…" : "Batalkan reservasi"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.status === "TERKIRIM" || detail.outgoingExpedition ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Buku Ekspedisi Surat Keluar</h2>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">
                    {detail.expeditionStatus === "DITERIMA"
                      ? "Sudah diterima"
                      : detail.expeditionStatus === "DIKIRIM"
                        ? "Sudah diserahkan"
                        : detail.expeditionStatus === "BELUM_DIKIRIM"
                          ? "Belum diserahkan"
                          : "Belum dicatat"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Buku ekspedisi mencatat serah terima surat ke caraka/pengekspedisi dan bukti
                  penerimaan dari instansi tujuan. Buku ini terpisah dari Buku Agenda Surat Keluar.
                </p>

                {detail.outgoingExpedition ? (
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="No. registrasi" value={detail.outgoingExpedition.regNumber} />
                    <Info label="Tujuan" value={detail.outgoingExpedition.recipientName} />
                    <Info label="Caraka" value={detail.outgoingExpedition.courierName ?? "—"} />
                    <Info label="Tanggal diserahkan" value={detail.outgoingExpedition.sentDate ?? "—"} />
                    <Info label="Diterima" value={detail.outgoingExpedition.receivedDate ?? "—"} />
                    <Info label="Penerima" value={detail.outgoingExpedition.receivedByName ?? "—"} />
                    <Info label="No. tanda terima" value={detail.outgoingExpedition.receiptNumber ?? "—"} />
                    <Info label="Catatan" value={detail.outgoingExpedition.note ?? "—"} />
                  </div>
                ) : (
                  <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-muted">
                    {detail.kgbRequest
                      ? "Surat ini belum dicatat di buku ekspedisi. Catat dari detail KGB."
                      : "Surat ini belum dicatat di buku ekspedisi. Catat penyerahan ke caraka di bawah."}
                  </p>
                )}

                {detail.kgbRequest ? (
                  <p className="mt-3 rounded-md border border-info-700/30 bg-info-100 px-3 py-2 text-sm text-info-700">
                    Surat ini terkait KGB{" "}
                    <Link href={`/kgb/${detail.kgbRequest.id}`} className="font-semibold underline">
                      {detail.kgbRequest.requestNumber}
                    </Link>
                    . Catat ekspedisi dan bukti terima dari detail KGB agar status KGB ikut diperbarui.
                  </p>
                ) : null}

                {canRecordExpedition && !detail.kgbRequest ? (
                  <div className="mt-4 border-t border-line pt-3">
                    <h3 className="text-sm font-semibold">Catat penyerahan ke caraka</h3>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <Field label="Tanggal diserahkan">
                        <input type="date" value={expeditionForm.sentDate} onChange={setExpedition("sentDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Nama caraka / pengekspedisi">
                        <input value={expeditionForm.courierName} onChange={setExpedition("courierName")} placeholder="Nama petugas" className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Instansi tujuan">
                        <input value={expeditionForm.recipientName} onChange={setExpedition("recipientName")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Catatan">
                        <input value={expeditionForm.note} onChange={setExpedition("note")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                    </div>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => void saveExpedition()}
                      className="mt-3 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      {acting === "expedition" ? "Menyimpan…" : "Catat serah terima ke caraka"}
                    </button>
                  </div>
                ) : null}

                {canMarkReceived && !detail.kgbRequest ? (
                  <div className="mt-4 border-t border-line pt-3">
                    <h3 className="text-sm font-semibold">Bukti terima dari instansi tujuan</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Isi setelah surat benar-benar diterima BKD. Data ini menjadi bukti penerimaan
                      di buku ekspedisi.
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <Field label="Tanggal diterima">
                        <input type="date" value={receiptForm.receivedDate} onChange={setReceipt("receivedDate")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Nama penerima">
                        <input value={receiptForm.receivedByName} onChange={setReceipt("receivedByName")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Nomor tanda terima (opsional)">
                        <input value={receiptForm.receiptNumber} onChange={setReceipt("receiptNumber")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                      <Field label="Catatan">
                        <input value={receiptForm.note} onChange={setReceipt("note")} className="w-full rounded-lg border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand-700" />
                      </Field>
                    </div>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => void saveReceipt()}
                      className="mt-3 rounded-lg bg-ok-700 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      {acting === "receipt" ? "Menyimpan…" : "Bukti terima sudah diterima"}
                    </button>
                  </div>
                ) : null}

                {detail.expeditionStatus === "DITERIMA" ? (
                  <p className="mt-3 rounded-md bg-ok-100 px-3 py-2 text-sm font-medium text-ok-700">
                    Surat sudah diterima {detail.outgoingExpedition?.recipientName ?? "instansi tujuan"}
                    {detail.outgoingExpedition?.receivedDate
                      ? ` pada ${detail.outgoingExpedition.receivedDate}`
                      : ""}.
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <div className="mt-2 space-y-2">
                {detail.documents?.length ? (
                  detail.documents.map((doc) => <DocumentPreview key={doc.id} document={doc} />)
                ) : (
                  <p className="text-sm text-muted">Belum ada dokumen.</p>
                )}
              </div>
              {canUpload ? (
                <div className="mt-3 border-t border-line pt-3">
                  <FileButton hint="PDF/JPG/PNG, maksimal 10 MB." onSelect={setFile} />
                  <button
                    type="button"
                    disabled={acting !== null || !file}
                    onClick={() => void upload()}
                    className="mt-2 rounded-lg border border-line bg-field px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-50"
                  >
                    {acting === "upload" ? "Mengunggah…" : "Unggah dokumen"}
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </RequirePerm>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
    </div>
  );
}
