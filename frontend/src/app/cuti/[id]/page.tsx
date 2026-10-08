"use client";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload } from "@/lib/api";
import type { LeaveDetail } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  review: "Beri pertimbangan",
  verify: "Verifikasi",
  revise: "Minta revisi",
  postpone: "Tangguhkan",
  paraf: "Paraf",
  approve: "Setujui",
  reject: "Tolak",
  sign: "Tandatangani",
  register: "Registrasi",
  tobkpsdm: "Teruskan ke BKPSDM",
  receiveresult: "Terima hasil BKPSDM",
  forward: "Teruskan ke Sekda",
  complete: "Selesaikan",
  archive: "Arsipkan",
};

const NOTE_REQUIRED = ["revise", "reject", "forward", "postpone"];

export default function CutiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const id = params.id;
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}`);
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
    if (NOTE_REQUIRED.includes(action) && !note.trim()) {
      toast.error("Catatan wajib diisi untuk aksi ini.");
      return;
    }
    setActing(action);
    try {
      const { data } = await apiFetch<LeaveDetail>(`/leave-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setDetail(data);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setActing(null);
    }
  }

  async function uploadAnswer() {
    if (!answerFile) {
      toast.error("Pilih file jawaban BKPSDM dulu (pdf/jpg/png).");
      return;
    }
    setActing("answer");
    try {
      const fd = new FormData();
      fd.append("file", answerFile);
      await apiUpload(`/leave-requests/${id}/answer-letter`, fd);
      setAnswerFile(null);
      toast.success("Surat jawaban BKPSDM tercatat.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggah gagal");
    } finally {
      setActing(null);
    }
  }

  async function removeDraft() {
    if (!window.confirm("Hapus draf ini permanen?")) return;
    setActing("delete");
    try {
      await apiFetch(`/leave-requests/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Draf dihapus.");
      router.replace("/cuti");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setActing(null);
    }
  }

  const isOwner = !!user?.employee && !!detail && user.employee.id === detail.employee?.id;
  const canAnswer =
    !!detail &&
    ["APPROVED", "SIGNED"].includes(detail.status) &&
    hasPermission("leave.document.upload") &&
    !(user?.role === "EMPLOYEE" && isOwner);

  return (
    <AppShell>
      <button onClick={() => router.back()} className="text-sm font-semibold text-muted hover:text-slate-900">
        ← Kembali
      </button>
      <div className="mt-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !detail ? (
          <EmptyState title="Data tidak ditemukan" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.requestNumber}</h1>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Pegawai</dt><dd className="font-medium">{detail.employee?.name}</dd></div>
                <div><dt className="text-muted">Jenis cuti</dt><dd className="font-medium">{detail.leaveType?.name}</dd></div>
                <div><dt className="text-muted">Periode</dt><dd className="font-medium">{detail.startDate?.slice(0,10)} → {detail.endDate?.slice(0,10)} ({detail.totalDays} hari)</dd></div>
                <div><dt className="text-muted">Alasan</dt><dd className="font-medium">{detail.reason}</dd></div>
                {detail.revisionNote ? <div><dt className="text-muted">Catatan revisi</dt><dd className="font-medium text-warn-700">{detail.revisionNote}</dd></div> : null}
                {detail.rejectionReason ? <div><dt className="text-muted">Alasan penolakan</dt><dd className="font-medium text-bad-700">{detail.rejectionReason}</dd></div> : null}
                {detail.postponeNote ? <div><dt className="text-muted">Catatan penangguhan</dt><dd className="font-medium text-secondary">{detail.postponeNote}</dd></div> : null}
              </dl>
            </div>

            {detail.supervisor && (detail.supervisor.direct || detail.supervisor.note) ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Atasan langsung</h2>
                {detail.supervisor.direct ? (
                  <p className="mt-1 text-sm">
                    <b>{detail.supervisor.direct.name}</b>
                    <span className="text-muted"> ({detail.supervisor.direct.position ?? "—"}{detail.supervisor.direct.nip ? ` • NIP ${detail.supervisor.direct.nip}` : ""})</span>
                  </p>
                ) : null}
                {detail.supervisor.note ? <p className="mt-1 text-sm text-muted">{detail.supervisor.note}</p> : null}
                {detail.supervisor.chain.length > 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    Rantai: {detail.supervisor.chain.map((c) => c.name).join(" → ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Keputusan</h2>
              {detail.availableActions?.length ? (
                <>
                  <p className="mt-1 border-l-2 border-warn-700 pl-3 text-sm text-secondary">
                    Menunggu keputusan Anda — permohonan ini berada pada tahap Anda.
                  </p>
                  {(detail.status === "DRAFT" || detail.status === "REVISION") ? (
                    <a
                      href={`/cuti/${detail.id}/edit`}
                      className="mt-2 inline-block rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-paper"
                    >
                      Ubah pengajuan
                    </a>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.availableActions.map((a) => (
                      <button
                        key={a}
                        disabled={acting !== null}
                        onClick={() => void act(a)}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                          a === "reject" ? "bg-bad-700 hover:brightness-110" : "bg-brand-900 hover:bg-brand-800"
                        }`}
                      >
                        {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Catatan (wajib untuk revisi/tolak/tangguhkan/forward, opsional lainnya)"
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
                  {detail.status === "DRAFT" && isOwner ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={acting !== null}
                        onClick={() => void removeDraft()}
                        className="rounded-lg border border-bad-700/30 bg-surface px-3 py-1.5 text-sm font-medium text-bad-700 hover:bg-bad-100 disabled:opacity-50"
                      >
                        {acting === "delete" ? "…" : "Hapus draf"}
                      </button>
                    </div>
                  ) : null}
                  {detail.availableActions.includes("forward") ? (
                    <p className="mt-1 text-xs text-muted">Forward hanya untuk pengajuan Camat — diteruskan ke Sekda di luar sistem.</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Tidak ada aksi tersedia untuk Anda pada status ini.</p>
              )}
            </div>

            {["APPROVED", "SIGNED", "COMPLETED"].includes(detail.status) ? (
              <div className="rounded-lg border border-line bg-surface p-5">
                <h2 className="font-semibold">Surat pengantar ke BKPSDM</h2>
                <p className="mt-1 text-sm text-muted">
                  Unduh/cetak surat pengantar sesuai formulir resmi, teruskan ke BKPSDM di luar sistem.
                  Setelah surat jawaban diterima, catat di bawah lalu lanjutkan SIGNED → registrasi.
                </p>
                <a
                  href={`/cuti/${detail.id}/surat`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                >
                  Buka surat pengantar (cetak)
                </a>
                {canAnswer ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setAnswerFile(e.target.files?.[0] ?? null)} className="text-sm" />
                    <button disabled={acting !== null} onClick={() => void uploadAnswer()} className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                      {acting === "answer" ? "…" : "Catat surat jawaban"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
                    <span className="font-semibold">{d.originalName}</span>
                    <span className="text-xs text-muted">({d.docType}, {(d.sizeBytes/1024).toFixed(1)} KB)</span>
                    <a
                      href={`/api${d.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto rounded-lg bg-brand-900 px-3 py-1 text-xs font-bold text-white hover:brightness-110"
                    >
                      Unduh
                    </a>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? (
                  <li className="text-muted">Belum ada dokumen.</li>
                ) : null}
              </ul>
            </div>

            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">Riwayat proses</h2>
              <ProcessTrail
                items={(detail.timeline ?? []).map((t, i, arr) => ({
                  title: `${t.action} — ${t.fromStatus} → ${t.toStatus}`,
                  subtitle: [t.actorName ?? t.actor, t.actorNip ? `NIP ${t.actorNip}` : null, t.actorPosition ?? null].filter(Boolean).join(" • "),
                  note: t.note,
                  time: new Date(t.createdAt).toLocaleString("id-ID"),
                  state:
                    i < arr.length - 1 || ["COMPLETED", "ARCHIVED", "REJECTED"].includes(detail.status)
                      ? "done"
                      : "now",
                }))}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
