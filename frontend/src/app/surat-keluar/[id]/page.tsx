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
  }, [detail?.id]);

  const setIssue =
    (key: keyof typeof issueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setIssueForm((form) => ({ ...form, [key]: e.target.value }));

  // Sumber kebenaran tombol aksi: availableActions dari backend.
  const actions = detail?.availableActions ?? [];
  const canIssue = actions.includes("issue");
  const canCancel = actions.includes("cancel");
  const canUpload = actions.includes("upload");
  const canResubmit = actions.includes("resubmit_archive");

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

  return (
    <RequirePerm perm="outgoing.view" label="Surat Keluar">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          ← Kembali
        </button>
        <Link href="/surat-keluar/agenda" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-paper">
          Register surat keluar
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
