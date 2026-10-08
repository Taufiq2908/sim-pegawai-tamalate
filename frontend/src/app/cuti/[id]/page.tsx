"use client";
import { toast } from "@/components/toast";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { LeaveDetail } from "@/lib/types";
import { EmptyState, ErrorBox, Skeleton, StatusBadge } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  submit: "Ajukan",
  verify: "Verifikasi",
  revise: "Minta revisi",
  paraf: "Paraf",
  approve: "Setujui",
  reject: "Tolak",
  sign: "Tandatangani",
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
    if ((action === "revise" || action === "reject") && !note.trim()) {
      toast.error("Catatan wajib diisi untuk revisi/penolakan.");
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
      <button onClick={() => router.back()} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
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
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{detail.requestNumber}</h1>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Pegawai</dt><dd className="font-medium">{detail.employee?.name}</dd></div>
                <div><dt className="text-slate-500">Jenis cuti</dt><dd className="font-medium">{detail.leaveType?.name}</dd></div>
                <div><dt className="text-slate-500">Periode</dt><dd className="font-medium">{detail.startDate?.slice(0,10)} → {detail.endDate?.slice(0,10)} ({detail.totalDays} hari)</dd></div>
                <div><dt className="text-slate-500">Alasan</dt><dd className="font-medium">{detail.reason}</dd></div>
                {detail.revisionNote ? <div><dt className="text-slate-500">Catatan revisi</dt><dd className="font-medium text-amber-700">{detail.revisionNote}</dd></div> : null}
                {detail.rejectionReason ? <div><dt className="text-slate-500">Alasan penolakan</dt><dd className="font-medium text-red-700">{detail.rejectionReason}</dd></div> : null}
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Aksi persetujuan</h2>
              {detail.availableActions?.length ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.availableActions.map((a) => (
                      <button
                        key={a}
                        disabled={acting !== null}
                        onClick={() => void act(a)}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                          a === "reject" ? "bg-red-600 hover:bg-red-500" : "bg-slate-900 hover:bg-slate-700"
                        }`}
                      >
                        {acting === a ? "Memproses…" : (ACTION_LABEL[a] ?? a)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Catatan (wajib untuk revisi/tolak, opsional lainnya)"
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Tidak ada aksi tersedia untuk Anda pada status ini.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Dokumen ({detail.documents?.length ?? 0})</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(detail.documents ?? []).map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/api${d.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-700 underline hover:no-underline"
                    >
                      {d.originalName}
                    </a>{" "}
                    <span className="text-slate-500">({d.docType}, {(d.sizeBytes/1024).toFixed(1)} KB)</span>
                  </li>
                ))}
                {(detail.documents ?? []).length === 0 ? (
                  <li className="text-slate-500">Belum ada dokumen.</li>
                ) : null}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Timeline</h2>
              <ol className="mt-3 space-y-3">
                {(detail.timeline ?? []).map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-900" />
                    <div>
                      <p className="font-semibold">{t.action} <span className="font-normal text-slate-500">{t.fromStatus} → {t.toStatus}</span></p>
                      <p className="text-slate-600">{t.actor}</p>
                      {t.note ? <p className="text-slate-600">“{t.note}”</p> : null}
                      <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString("id-ID")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
