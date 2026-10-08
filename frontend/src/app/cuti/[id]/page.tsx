"use client";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { LeaveDetail } from "@/lib/types";
import { EmptyState, ErrorBox, ProcessTrail, Skeleton, StatusBadge } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  verify: "Verifikasi",
  revise: "Minta revisi",
  paraf: "Paraf",
  approve: "Setujui",
  reject: "Tolak",
  sign: "Tandatangani",
  forward: "Teruskan ke Sekda",
  complete: "Selesaikan",
};

export default function CutiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");

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
    if ((action === "revise" || action === "reject" || action === "forward") && !note.trim()) {
      const msg =
        action === "forward"
          ? "Catatan wajib diisi untuk forward (nomor/tanggal penerusan ke Sekda)."
          : "Catatan wajib diisi untuk revisi/penolakan.";
      toast.error(msg);
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
              </dl>
            </div>

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
                    placeholder="Catatan (wajib untuk revisi/tolak/forward ke Sekda, opsional lainnya)"
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-700"
                  />
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
                  Setelah surat jawaban diterima, kembali ke sini untuk pengarsipan dan penyerahan ke pegawai.
                </p>
                <a
                  href={`/cuti/${detail.id}/surat`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper"
                >
                  Buka surat pengantar (cetak)
                </a>
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
                  subtitle: t.actor,
                  note: t.note,
                  time: new Date(t.createdAt).toLocaleString("id-ID"),
                  state:
                    i < arr.length - 1 || ["COMPLETED", "REJECTED"].includes(detail.status)
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
